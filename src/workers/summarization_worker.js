'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const { connectRedis } = require('../config/redis');
const RawNews = require('../models/RawNews');
const { processPipeline } = require('../services/pipeline.service');
const logger = require('../utils/logger');

const BATCH_SIZE = 50;

/**
 * Summarization + full pipeline worker.
 * Picks up pending RawNews records and processes them through the pipeline.
 */
const run = async () => {
    logger.info(`[Pipeline] 🧠 Summarization Worker Started...`);
    try {
        await connectDB();
        await connectRedis();

        let processed = 0;
        let failed = 0;

        // ─── Process in atomic batches ───────────────────────────────────────
        // Use findOneAndUpdate to "lock" the record so other workers skip it.
        while (processed < BATCH_SIZE) {
            const rawNews = await RawNews.findOneAndUpdate(
                { processingStatus: 'pending', retryCount: { $lt: 3 } },
                { $set: { processingStatus: 'processing' } },
                { sort: { createdAt: -1 }, new: true } // Newest first
            );

            if (!rawNews) break; // queue empty

            try {
                logger.info(`[Pipeline] 🧠 Summarizing: "${(rawNews.title || 'Untitled').substring(0, 80)}..."`);
                await processPipeline(rawNews);
                processed++;

                // 🤫 The "Slow Drip" Secret Weapon: Sleep for 3 seconds to avoid Groq Rate Limits
                if (processed < BATCH_SIZE) {
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                }
            } catch (err) {
                logger.error(`[Pipeline] ❌ Summarization Failed! ID: ${rawNews._id} | Title: "${rawNews.title || 'Untitled'}" | Reason: ${err.message}`);
                failed++;
            }
        }

        logger.info(`[Pipeline] 🧠 Summarization Complete! Processed: ${processed}, Failed: ${failed}`);
        return { processed, failed };
    } catch (err) {
        logger.error('[Summarization Worker] Fatal error:', err);
        if (require.main === module) process.exit(1);
    } finally {
        if (require.main === module) process.exit(0);
    }
};

if (require.main === module) {
    run();
}

module.exports = { run };
