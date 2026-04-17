'use strict';

/**
 * geminiWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A dedicated, Gemini-only image generation worker.
 * Run manually when you want premium Gemini-quality images.
 *
 * Usage: npm run worker:gemini
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { GoogleGenAI, Modality } = require('@google/genai');
const connectDB = require('../config/database');
const { connectRedis } = require('../config/redis');
const News = require('../models/News');
const NewsTranslation = require('../models/NewsTranslation');
const { uploadToCloud } = require('../utils/r2');
const logger = require('../utils/logger');

// ─── Configuration ─────────────────────────────────────────────────────────
const BATCH_SIZE = parseInt(process.env.VIVA_DIGITAL_GEMINI_WORKER_BATCH_SIZE || '5', 10);
const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';
const INTER_CALL_DELAY_MS = 35000; // 35s between calls — safe for 2 RPM free tier

// ─── Gemini Client ──────────────────────────────────────────────────────────
let _geminiClient = null;
const getGeminiClient = () => {
    if (!_geminiClient) {
        const key = process.env.VIVA_DIGITAL_GEMINI_API_KEY;
        if (!key) throw new Error('GEMINI_API_KEY not set in .env');
        _geminiClient = new GoogleGenAI({ apiKey: key });
    }
    return _geminiClient;
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GEMINI_PROMPT_TEMPLATE = `
Act as a professional editorial illustrator for a high-quality, public-facing news application.
Your goal is to create a clean, symbolic, and professional image based on the news provided.

### CORE INSTRUCTIONS:
- STYLE: Modern digital art, minimalist, and high-contrast. No realistic human faces.
- COMPOSITION: Wide-angle, 16:9 aspect ratio, professional lighting.
- NO TEXT: Do not include any letters, numbers, or watermarks in the image.

### SAFETY & CONTENT RULES:
- STRICT: NO blood, NO weapons, NO gore, NO hateful symbols, and NO physical violence.
- SENSITIVE TOPICS: If the news is about an accident, crime, or tragedy, generate an abstract/symbolic image
  (e.g., a broken chain, a glowing emergency siren, or a somber rainy street) rather than the event itself.

### INPUT DATA:
Title: {{title}}
Summary: {{summary}}
`;

const buildPrompt = (title, summary = '') =>
    GEMINI_PROMPT_TEMPLATE
        .replace('{{title}}', title.substring(0, 250))
        .replace('{{summary}}', summary.substring(0, 500) || 'No summary available.');

const buildUniqueStoryPipeline = (batchSize) => [
    {
        $match: {
            status: { $in: ['published', 'review'] },
            $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }],
        },
    },
    { $sort: { publishedAt: -1 } },
    { $addFields: { storyKey: { $ifNull: ['$parentNewsId', '$_id'] } } },
    {
        $group: {
            _id: '$storyKey',
            repTitle: { $first: '$title' },
            repSummary: { $first: '$summary' },
            publishedAt: { $first: '$publishedAt' },
        },
    },
    { $sort: { publishedAt: -1 } },
    { $limit: batchSize },
];

// ─── Core Logic ─────────────────────────────────────────────────────────────
const run = async () => {
    const stats = { processed: 0, skipped: 0, failed: 0 };
    logger.info('[GeminiWorker] ♊ Starting Gemini-only image generation pass...');

    try {
        const uniqueStories = await News.aggregate(buildUniqueStoryPipeline(BATCH_SIZE));

        if (uniqueStories.length === 0) {
            logger.info('[GeminiWorker] ✅ No stories missing images — nothing to do.');
            return stats;
        }

        logger.info(`[GeminiWorker] Found ${uniqueStories.length} story(-ies) to process.`);

        for (let i = 0; i < uniqueStories.length; i++) {
            const story = uniqueStories[i];
            const storyKey = story._id;

            logger.info(`[GeminiWorker] [${i + 1}/${uniqueStories.length}] Processing: "${story.repTitle.substring(0, 70)}"`);

            try {
                const ai = getGeminiClient();
                const prompt = buildPrompt(story.repTitle, story.repSummary);

                logger.info('[GeminiWorker] ♊ Calling Gemini...');
                const response = await ai.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: prompt,
                    config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
                });

                const imagePart = response?.candidates?.[0]?.content?.parts?.find(
                    (p) => p.inlineData?.mimeType?.startsWith('image/')
                );

                if (!imagePart) {
                    logger.warn('[GeminiWorker] ⚠️ Gemini returned no image. Skipping story.');
                    stats.skipped++;
                    continue;
                }

                const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
                const fileName = `gemini-${Date.now()}.png`;
                const imageUrl = await uploadToCloud(imageBuffer, fileName, 'image/png', 'ai-images');

                await News.updateMany(
                    {
                        $and: [
                            { $or: [{ _id: storyKey }, { parentNewsId: storyKey }] },
                            { $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }] },
                        ],
                    },
                    { $set: { imageUrl } }
                );
                await NewsTranslation.updateMany(
                    { newsId: storyKey, $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }] },
                    { $set: { imageUrl } }
                );

                logger.info(`[GeminiWorker] ✅ Done → ${imageUrl}`);
                stats.processed++;

            } catch (err) {
                logger.warn(`[GeminiWorker] ⚠️ Failed for story [${i + 1}]: ${err.message?.substring(0, 150)}`);
                stats.skipped++;
            }

            // Wait between calls to respect rate limits
            if (i < uniqueStories.length - 1) {
                logger.info(`[GeminiWorker] ⏳ Waiting ${INTER_CALL_DELAY_MS / 1000}s before next call...`);
                await sleep(INTER_CALL_DELAY_MS);
            }
        }

        logger.info(
            `[GeminiWorker] 📊 Done | Generated: ${stats.processed} | Skipped: ${stats.skipped} | Failed: ${stats.failed}`
        );
    } catch (err) {
        logger.error(`[GeminiWorker] 💥 Fatal: ${err.message}`);
    }

    return stats;
};

// ─── Standalone execution ───────────────────────────────────────────────────
if (require.main === module) {
    (async () => {
        await connectDB();
        await connectRedis();
        await run();
        process.exit(0);
    })();
}

module.exports = { run };
