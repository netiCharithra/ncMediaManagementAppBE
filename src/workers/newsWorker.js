'use strict';

/**
 * newsWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scheduled worker (every 5 minutes via node-cron) that:
 *  1. Uses MongoDB aggregation to find UNIQUE stories missing images.
 *  2. Tag-based Cross-Source Deduplication (Layer 2).
 *  3. Simple 3-tier waterfall: Gemini → Hugging Face → Pollinations.
 *     Every story tries Gemini first. If Gemini fails, falls back to HF.
 *     If HF fails, falls back to Pollinations.
 *  4. Bulk-updates ALL sibling docs (original + every translation) in one shot.
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
const BATCH_SIZE = parseInt(process.env.VIVA_DIGITAL_IMAGE_WORKER_BATCH_SIZE || '10', 10);
const TAG_DEDUP_WINDOW_HOURS = parseInt(process.env.VIVA_DIGITAL_TAG_DEDUP_WINDOW_HOURS || '12', 10);
const TAG_MATCH_THRESHOLD = parseInt(process.env.VIVA_DIGITAL_TAG_MATCH_THRESHOLD || '2', 10);
const INTER_CALL_DELAY_MS = parseInt(process.env.VIVA_DIGITAL_IMAGE_WORKER_DELAY_MS || '35000', 10);

// ─── Helpers ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildUniqueStoryPipeline = (batchSize) => [
    {
        $match: {
            status: { $in: ['published', 'review'] },
            $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }],
        },
    },
    { $sort: { publishedAt: -1 } },
    { $addFields: { storyKey: { $ifNull: ['$parentNewsId', '$_id'] } } },
    // Assign a language priority score: en=1, -na-=2, others=3
    // This ensures English titles are preferred for image prompt generation
    {
        $addFields: {
            langPriority: {
                $switch: {
                    branches: [
                        { case: { $eq: ['$originalLanguage', 'en'] }, then: 1 },
                        { case: { $eq: ['$originalLanguage', '-na-'] }, then: 2 },
                    ],
                    default: 3,
                },
            },
        },
    },
    // Sort by language priority FIRST (en articles bubble up), then by date
    { $sort: { langPriority: 1, publishedAt: -1 } },
    {
        $group: {
            _id: '$storyKey',
            repId: { $first: '$_id' },
            repTitle: { $first: '$title' },
            repSummary: { $first: '$summary' },
            repTags: { $first: '$tags' },
            repParentNewsId: { $first: '$parentNewsId' },
            repLang: { $first: '$originalLanguage' },
            publishedAt: { $first: '$publishedAt' },
        },
    },
    { $sort: { publishedAt: -1 } },
    { $limit: batchSize },
];

const findSiblingImageByTags = async (tags, storyKey) => {
    if (!tags || tags.length < TAG_MATCH_THRESHOLD) return null;
    const windowStart = new Date(Date.now() - TAG_DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
    try {
        const candidates = await News.find({
            status: { $in: ['published', 'review'] },
            imageUrl: { $exists: true, $nin: [null, ''] },
            publishedAt: { $gte: windowStart },
            tags: { $in: tags },
            _id: { $ne: storyKey },
            parentNewsId: { $ne: storyKey },
        }).select('_id imageUrl tags title').sort({ publishedAt: -1 }).limit(10).lean();

        if (!candidates.length) return null;
        const tagSet = new Set(tags);
        for (const candidate of candidates) {
            const matchCount = (candidate.tags || []).filter(t => tagSet.has(t)).length;
            if (matchCount >= TAG_MATCH_THRESHOLD) return candidate.imageUrl;
        }
    } catch (err) {
        logger.warn(`[NewsWorker] ⚠️ Tag-dedup failed: ${err.message}`);
    }
    return null;
};

// ─── Core Logic ───────────────────────────────────────────────────────────
const run = async () => {
    const stats = { processed: 0, reused: 0, failed: 0 };
    logger.info('[NewsWorker] 🖼️ Starting image generation pass (Gemini → HF → Pollinations)...');

    try {
        const uniqueStories = await News.aggregate(buildUniqueStoryPipeline(BATCH_SIZE));
        if (uniqueStories.length === 0) {
            logger.info('[NewsWorker] ✅ No stories missing images.');
            return stats;
        }

        logger.info(`[NewsWorker] Found ${uniqueStories.length} unique story(-ies) without images (batch cap: ${BATCH_SIZE}).`);

        const NewsTranslation = require('../models/NewsTranslation');

        for (let i = 0; i < uniqueStories.length; i++) {
            const story = uniqueStories[i];
            const storyKey = story._id;
            const storyTags = story.repTags || [];

            logger.info(
                `[NewsWorker] [${i + 1}/${uniqueStories.length}] Processing: "${(story.repTitle || '').substring(0, 80)}"\n` +
                `  Lang: ${story.repLang || 'unknown'} | Tags: [${storyTags.join(', ')}]`
            );

            try {
                // Layer 2: Tag-based dedup
                const siblingImageUrl = await findSiblingImageByTags(storyTags, storyKey);
                let imageUrl = siblingImageUrl;
                let source = siblingImageUrl ? 'tag-dedup' : '';

                // Layer 1: Waterfall generation — Gemini → HF → Pollinations
                if (!imageUrl) {
                    logger.info('[NewsWorker] 🎨 No tag-dedup match — generating new image via AI...');
                    const result = await generateAndUploadImage({
                        title: story.repTitle,
                        summary: story.repSummary,
                        parentNewsId: String(storyKey),
                    });
                    imageUrl = result?.imageUrl;
                    source = result?.source;
                }

                if (imageUrl) {
                    const updateResult = await News.updateMany(
                        { $and: [
                            { $or: [{ _id: storyKey }, { parentNewsId: storyKey }] },
                            { $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }] }
                        ]},
                        { $set: { imageUrl } }
                    );
                    const transResult = await NewsTranslation.updateMany(
                        { newsId: storyKey, $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }] },
                        { $set: { imageUrl } }
                    );

                    if (source === 'tag-dedup') {
                        stats.reused++;
                        logger.info(`[NewsWorker] ♻️  REUSED image for "${(story.repTitle || '').substring(0, 70)}" (updated ${updateResult.modifiedCount} News, ${transResult.modifiedCount} Translations)`);
                    } else {
                        stats.processed++;
                        logger.info(`[NewsWorker] ✅ "${(story.repTitle || '').substring(0, 70)}" → ${imageUrl} [${source}] (updated ${updateResult.modifiedCount} News, ${transResult.modifiedCount} Translations)`);
                    }
                } else {
                    stats.failed++;
                }

                // Throttle: only wait if an API was actually called
                if (i < uniqueStories.length - 1 && source !== 'tag-dedup' && source !== 'cache') {
                    const delayMs = source === 'Colab' ? 5000 : INTER_CALL_DELAY_MS;
                    logger.info(`[NewsWorker] ⏳ Waiting ${delayMs / 1000}s (${source || 'unknown'}) before next call...`);
                    await sleep(delayMs);
                }

            } catch (err) {
                logger.error(`[NewsWorker] ❌ Story ${storyKey}: ${err.message}`);
                stats.failed++;
            }
        }

        logger.info(`[NewsWorker] 📊 Pass complete | Generated: ${stats.processed} | Reused (tag-dedup): ${stats.reused} | Failed: ${stats.failed}`);
    } catch (err) {
        logger.error(`[NewsWorker] 💥 Fatal error: ${err.message}`);
        if (require.main === module) process.exit(1);
    }

    return stats;
};

// ─── Schedule ──────────────────────────────────────────────────────────────
const schedule = () => {
    cron.schedule('*/5 * * * *', async () => {
        clearImageCache();
        try { await run(); } catch (err) { logger.error(`[Cron] NewsWorker error: ${err.message}`); }
    });
    logger.info('[Cron] 🖼️ NewsWorker scheduled: every 5 minutes.');
};

if (require.main === module) {
    (async () => {
        await connectDB();
        await connectRedis();
        await run();
        process.exit(0);
    })();
}

module.exports = { run, schedule };
