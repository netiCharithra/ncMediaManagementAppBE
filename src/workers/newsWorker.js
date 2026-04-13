'use strict';

/**
 * newsWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scheduled worker (every 5 minutes via node-cron) that:
 *  1. Uses MongoDB aggregation to find UNIQUE stories missing images
 *     (one record per parentNewsId group — eliminating translation duplicates).
 *  2. ─── NEW: Tag-based Cross-Source Deduplication ───────────────────────────
 *     Before calling any AI image API, queries the DB for a story published
 *     in the LAST 12 HOURS that:
 *       a) Already has an imageUrl, AND
 *       b) Shares at least TAG_MATCH_THRESHOLD (2) tags with the current story.
 *     If found → reuses the existing image URL (0 API calls, 0 cost).
 *     If not found → falls through to generate a new image as before.
 *  3. Generates ONE image per unique story via the Hugging Face service.
 *  4. Bulk-updates ALL sibling docs (original + every translation) in one shot.
 *
 * Deduplication Layers:
 *   Layer 1 — Translation siblings  : parentNewsId grouping (pre-existing)
 *   Layer 2 — Cross-source same event: Tag-matching within 12-hour window (NEW)
 *
 * This guarantees only 1 Hugging Face API call per unique news EVENT,
 * regardless of how many sources (TOI, NDTV, TheHindu…) or translations exist.
 *
 * Can also be run as a standalone one-shot script:
 *   node src/workers/newsWorker.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const cron = require('node-cron');
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { connectRedis } = require('../config/redis');
const News = require('../models/News');
const { generateAndUploadImage, clearImageCache } = require('../services/hfImageService');
const logger = require('../utils/logger');

// ─── Configuration ─────────────────────────────────────────────────────────
/** Max unique stories to process per cron tick. */
const BATCH_SIZE = parseInt(process.env.IMAGE_WORKER_BATCH_SIZE || '5', 10);

/** Delay between Hugging Face API calls (ms). Flux model is ~2 RPM free tier. */
const INTER_CALL_DELAY_MS = parseInt(process.env.IMAGE_WORKER_DELAY_MS || '35000', 10);

/**
 * How far back to look for a matching-tag story that already has an image.
 * Default: 12 hours. Stories from different sources reporting the same event
 * are almost always published within this window.
 */
const TAG_DEDUP_WINDOW_HOURS = parseInt(process.env.TAG_DEDUP_WINDOW_HOURS || '12', 10);

/**
 * Minimum number of tags that must INTERSECT between two stories for us to
 * consider them "the same event" and reuse the image.
 * - 1 tag match is too loose (e.g., both tagged "india").
 * - 2 tag matches is the production sweet-spot.
 * - 3 is safe but may miss valid dedup opportunities.
 */
const TAG_MATCH_THRESHOLD = parseInt(process.env.TAG_MATCH_THRESHOLD || '2', 10);

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build the aggregation pipeline that returns ONE representative article per
 * unique "story" that is missing an image.
 *
 * Deduplication key (Layer 1 — translation siblings):
 *  - Articles without a parentNewsId  → their own _id is the story key
 *  - Translations with a parentNewsId → parentNewsId is the story key
 *
 * We use $ifNull to normalise both cases into a single `storyKey` field, then
 * $group to pick the English (originalLanguage) representative if available,
 * otherwise just the first one.
 */
const buildUniqueStoryPipeline = (batchSize) => [
    // 1. Only published or review articles with no image
    {
        $match: {
            status: { $in: ['published', 'review'] },
            $or: [
                { imageUrl: { $exists: false } },
                { imageUrl: null },
                { imageUrl: '' },
            ],
        },
    },
    // 2. Sort latest first BEFORE grouping (essential for $first to get the latest record's title/summary)
    { $sort: { publishedAt: -1 } },
    // 3. Normalise story key: translations share parentNewsId; originals use own _id
    {
        $addFields: {
            storyKey: { $ifNull: ['$parentNewsId', '$_id'] },
        },
    },
    // 4. Group by unique story — pick metadata from the latest record in each group
    {
        $group: {
            _id: '$storyKey',
            repId: { $first: '$_id' },
            repTitle: { $first: '$title' },
            repSummary: { $first: '$summary' },
            repTags: { $first: '$tags' },           // ← Collect tags for dedup
            repParentNewsId: { $first: '$parentNewsId' },
            originalLang: { $first: '$originalLanguage' },
            publishedAt: { $first: '$publishedAt' },
        },
    },
    // 5. Final sort of unique stories themselves (latest first)
    { $sort: { publishedAt: -1 } },
    // 6. Limit to batch size
    { $limit: batchSize },
];

/**
 * ── Layer 2: Tag-based cross-source deduplication ──────────────────────────
 *
 * Checks if a "sibling" story covering the SAME EVENT already exists in the DB
 * (from a different source) with an image, published within the dedup window.
 *
 * Algorithm:
 *   Query for published/review stories that:
 *     - Have an imageUrl already set
 *     - Were published within the last TAG_DEDUP_WINDOW_HOURS hours
 *     - Share at least TAG_MATCH_THRESHOLD tags with the current story
 *     - Are NOT the current story itself
 *
 * Returns the imageUrl of the first matching sibling, or null if no match.
 *
 * @param {string[]} tags       - Tags of the current story (from Groq AI)
 * @param {ObjectId} storyKey   - The current story's _id / parentNewsId (to exclude self)
 * @returns {Promise<string|null>}
 */
const findSiblingImageByTags = async (tags, storyKey) => {
    // Guard: Need at least TAG_MATCH_THRESHOLD tags to do a meaningful search
    if (!tags || tags.length < TAG_MATCH_THRESHOLD) {
        return null;
    }

    const windowStart = new Date(Date.now() - TAG_DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

    try {
        /**
         * MongoDB approach: Use $in to match documents that contain ANY of our tags,
         * then in application code filter to those with >= TAG_MATCH_THRESHOLD overlap.
         *
         * Why not `$all`? Because $all requires ALL tags to match — too strict.
         * Why not a JS filter alone? MongoDB $in gives us a tight index-scanned candidate set.
         * This hybrid is the production-optimal approach for MongoDB.
         */
        const candidates = await News.find({
            status: { $in: ['published', 'review'] },
            imageUrl: { $exists: true, $nin: [null, ''] },
            publishedAt: { $gte: windowStart },
            tags: { $in: tags },
            // Exclude the story group itself (both original and its translations)
            _id: { $ne: storyKey },
            parentNewsId: { $ne: storyKey },
        })
            .select('_id imageUrl tags publishedAt title')
            .sort({ publishedAt: -1 })
            .limit(20)  // Safety cap — evaluate intersection on a small candidate set
            .lean();

        if (!candidates.length) return null;

        // Count tag intersection for each candidate
        const tagSet = new Set(tags);
        for (const candidate of candidates) {
            const candidateTags = candidate.tags || [];
            const matchCount = candidateTags.filter((t) => tagSet.has(t)).length;

            if (matchCount >= TAG_MATCH_THRESHOLD) {
                logger.info(
                    `[NewsWorker] 🔁 Tag-dedup HIT: Found sibling with ${matchCount} matching tags → reusing image.\n` +
                    `  Sibling: "${(candidate.title || '').substring(0, 70)}"\n` +
                    `  Common tags: [${candidateTags.filter((t) => tagSet.has(t)).join(', ')}]\n` +
                    `  Image: ${candidate.imageUrl}`
                );
                return candidate.imageUrl;
            }
        }

        return null; // No candidate passed the threshold
    } catch (err) {
        // Non-fatal — log and proceed to generate a new image
        logger.warn(`[NewsWorker] ⚠️ Tag-dedup query failed (non-fatal): ${err.message}`);
        return null;
    }
};

/**
 * Core logic: find unique stories without images, generate, and persist.
 * Returns a stats summary object.
 *
 * @returns {Promise<{processed: number, reused: number, failed: number}>}
 */
const run = async () => {
    const stats = { processed: 0, reused: 0, failed: 0 };

    logger.info('[NewsWorker] 🖼️  Starting image generation pass...');

    try {
        // ── Step 1: Aggregate unique stories missing images ─────────────────
        const uniqueStories = await News.aggregate(buildUniqueStoryPipeline(BATCH_SIZE));

        if (uniqueStories.length === 0) {
            logger.info('[NewsWorker] ✅ No stories missing images — nothing to do.');
            return stats;
        }

        logger.info(
            `[NewsWorker] Found ${uniqueStories.length} unique story(-ies) without images (batch cap: ${BATCH_SIZE}).`
        );

        const NewsTranslation = require('../models/NewsTranslation');

        // ── Step 2: For each unique story → check tag-dedup → generate/reuse image → update all siblings ─
        for (let i = 0; i < uniqueStories.length; i++) {
            const story = uniqueStories[i];

            // storyKey (_id in aggregation) is the parentNewsId or the original's own _id
            const storyKey = story._id; // ObjectId
            const storyTags = story.repTags || [];

            logger.info(
                `[NewsWorker] [${i + 1}/${uniqueStories.length}] Processing: "${(story.repTitle || '').substring(0, 80)}"\n` +
                `  Tags: [${storyTags.join(', ')}]`
            );

            let imageUrl = null;
            let source = '';

            try {
                // ── Layer 2: Tag-based cross-source dedup check ─────────────
                const siblingImageUrl = await findSiblingImageByTags(storyTags, storyKey);

                if (siblingImageUrl) {
                    // ✅ Reuse — zero API calls
                    imageUrl = siblingImageUrl;
                    source = 'tag-dedup';
                } else {
                    // ── Layer 1 already handled (parentNewsId grouping in agg)
                    // ── Proceed to generate a fresh image ──────────────────
                    logger.info(
                        `[NewsWorker] 🎨 No tag-dedup match — generating new image via AI...`
                    );

                    const result = await generateAndUploadImage({
                        title: story.repTitle,
                        summary: story.repSummary,
                        parentNewsId: String(storyKey), // used as in-memory cache key
                    });

                    imageUrl = result?.imageUrl || null;
                    source = result?.source || '';
                }

                if (imageUrl) {
                    // Update:
                    //  a) The original News record and its promoted siblings
                    const updateResult = await News.updateMany(
                        {
                            $and: [
                                {
                                    $or: [
                                        { _id: storyKey },
                                        { parentNewsId: storyKey },
                                    ],
                                },
                                {
                                    $or: [
                                        { imageUrl: { $exists: false } },
                                        { imageUrl: null },
                                        { imageUrl: '' },
                                    ],
                                },
                            ],
                        },
                        { $set: { imageUrl } }
                    );

                    //  b) Sync to the NewsTranslation collection where the pending versions live
                    const transResult = await NewsTranslation.updateMany(
                        {
                            newsId: storyKey,
                            $or: [
                                { imageUrl: { $exists: false } },
                                { imageUrl: null },
                                { imageUrl: '' },
                            ],
                        },
                        { $set: { imageUrl } }
                    );

                    if (source === 'tag-dedup') {
                        stats.reused++;
                        logger.info(
                            `[NewsWorker] ♻️  REUSED image for "${(story.repTitle || '').substring(0, 70)}" ` +
                            `(updated ${updateResult.modifiedCount} News, ${transResult.modifiedCount} Translations)`
                        );
                    } else {
                        stats.processed++;
                        logger.info(
                            `[NewsWorker] ✅ "${(story.repTitle || '').substring(0, 70)}" → ${imageUrl} ` +
                            `[${source}] (updated ${updateResult.modifiedCount} News, ${transResult.modifiedCount} Translations)`
                        );
                    }
                } else {
                    // generateAndUploadImage already logged the reason
                    stats.failed++;
                }
            } catch (err) {
                logger.error(
                    `[NewsWorker] ❌ Story ${storyKey}: ${err.message}`
                );
                stats.failed++;
            }

            // ─── Dynamic Throttle ──────────────────────────────────────────
            // Tag-dedup and Pollinations/Cache hits are fast (< 1s) — no need to wait.
            // Only wait 35s for HuggingFace (Rate Limit: ~2 RPM on free tier).
            if (i < uniqueStories.length - 1) {
                const waitMs = (source === 'HuggingFace') ? INTER_CALL_DELAY_MS : 1000;
                if (source !== 'tag-dedup') {
                    logger.info(`[NewsWorker] ⏳ Waiting ${waitMs / 1000}s (${source || 'unknown'}) before next call...`);
                    await sleep(waitMs);
                }
                // tag-dedup hits: no wait → full throughput
            }
        }

        logger.info(
            `[NewsWorker] 📊 Pass complete | Generated: ${stats.processed} | Reused (tag-dedup): ${stats.reused} | Failed: ${stats.failed}`
        );
    } catch (fatalErr) {
        logger.error(`[NewsWorker] 💥 Fatal error: ${fatalErr.message}`, fatalErr);
        if (require.main === module) process.exit(1);
    }

    return stats;
};

// ─── Cron Schedule ─────────────────────────────────────────────────────────
/**
 * Schedule the worker every 5 minutes.
 * Called from cronScheduler.js so it runs inside the main server process.
 */
const schedule = () => {
    cron.schedule('*/5 * * * *', async () => {
        clearImageCache(); // release in-process cache between runs
        logger.info('[Cron] 🖼️  Triggering NewsWorker: image generation pass...');
        try {
            const stats = await run();
            logger.info(
                `[Cron] 🖼️  NewsWorker done — Generated: ${stats.processed} | Reused: ${stats.reused} | Failed: ${stats.failed}`
            );
        } catch (err) {
            logger.error(`[Cron] 🖼️  NewsWorker cron error: ${err.message}`);
        }
    });

    logger.info('[Cron] 🖼️  NewsWorker scheduled: every 5 minutes.');
};

// ─── Standalone execution ──────────────────────────────────────────────────
if (require.main === module) {
    (async () => {
        await connectDB();
        await connectRedis();
        await run();
        process.exit(0);
    })();
}

module.exports = { run, schedule };
