'use strict';

/**
 * newsWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scheduled worker (every 5 minutes via node-cron) that:
 *  1. Uses MongoDB aggregation to find UNIQUE stories missing images
 *     (one record per parentNewsId group — eliminating translation duplicates).
 *  2. Generates ONE image per unique story via the Gemini service.
 *  3. Bulk-updates ALL sibling docs (original + every translation) in one shot.
 *
 * This guarantees only 1 Gemini API call per news story regardless of how many
 * language translations exist.
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

/** Delay between Gemini API calls (ms). Preview model is ~2 RPM free tier. */
const INTER_CALL_DELAY_MS = parseInt(process.env.IMAGE_WORKER_DELAY_MS || '35000', 10);

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build the aggregation pipeline that returns ONE representative article per
 * unique "story" that is missing an image.
 *
 * Deduplication key:
 *  - Articles without a parentNewsId  → their own _id is the story key
 *  - Translations with a parentNewsId → parentNewsId is the story key
 *
 * We use $ifNull to normalise both cases into a single `storyKey` field, then
 * $group to pick the English (originalLanguage) representative if available,
 * otherwise just the first one.
 */
const buildUniqueStoryPipeline = (batchSize) => [
    // 1. Only published articles with no image
    {
        $match: {
            status: 'published',
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
 * Core logic: find unique stories without images, generate, and persist.
 * Returns a stats summary object.
 *
 * @returns {Promise<{processed: number, failed: number}>}
 */
const run = async () => {
    const stats = { processed: 0, failed: 0 };

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

        // ── Step 2: For each unique story → generate image → update all siblings ─
        for (let i = 0; i < uniqueStories.length; i++) {
            const story = uniqueStories[i];

            // storyKey (_id in aggregation) is the parentNewsId or the original's own _id
            const storyKey = story._id; // ObjectId

            logger.info(
                `[NewsWorker] [${i + 1}/${uniqueStories.length}] Generating for: "${(story.repTitle || '').substring(0, 80)}"`
            );

            try {
                const imageUrl = await generateAndUploadImage({
                    title: story.repTitle,
                    summary: story.repSummary,
                    parentNewsId: String(storyKey), // used as in-memory cache key
                });

                if (imageUrl) {
                    // Update:
                    //  a) The original (storyKey is its _id, parentNewsId is null)
                    //  b) All translations whose parentNewsId === storyKey
                    const result = await News.updateMany(
                        {
                            $and: [
                                // Match the original OR any translation sharing this storyKey
                                {
                                    $or: [
                                        { _id: storyKey },
                                        { parentNewsId: storyKey },
                                    ],
                                },
                                // Only touch docs that still have no image (idempotent)
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

                    stats.processed++;
                    logger.info(
                        `[NewsWorker] ✅ "${(story.repTitle || '').substring(0, 70)}" → ${imageUrl} (updated ${result.modifiedCount} docs)`
                    );
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

            // Throttle between calls — preview model has strict RPM limits
            if (i < uniqueStories.length - 1) {
                logger.info(`[NewsWorker] ⏳ Waiting ${INTER_CALL_DELAY_MS / 1000}s before next call...`);
                await sleep(INTER_CALL_DELAY_MS);
            }
        }

        logger.info(
            `[NewsWorker] 📊 Pass complete | Generated: ${stats.processed} | Failed: ${stats.failed}`
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
                `[Cron] 🖼️  NewsWorker done — Generated: ${stats.processed} | Failed: ${stats.failed}`
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
