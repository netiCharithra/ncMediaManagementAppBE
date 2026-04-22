'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const { connectRedis, getRedisClient } = require('../config/redis');
const RawNews = require('../models/RawNews');
const { processPipeline } = require('../services/pipeline.service');
const logger = require('../utils/logger');

const BATCH_SIZE = 50;
const INTER_REQUEST_DELAY_MS = 12000; // 12s between requests – keeps us under Groq free-tier ~6K TPM
const RESUMMARIZE_BATCH = 5;          // Re-summarize up to 5 fallback articles per run

/**
 * Summarization + full pipeline worker.
 * Picks up pending RawNews records and processes them through the pipeline.
 */
const run = async () => {
    logger.info(`[Pipeline] 🧠 Summarization Worker Started...`);
    try {
        // connectDB() is idempotent — it no-ops if already connected
        await connectDB();

        const redisAlreadyConnected = getRedisClient && (() => {
            try { return !!getRedisClient(); } catch { return false; }
        })();

        if (!redisAlreadyConnected) {
            await connectRedis();
        }

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

                // 🤫 Slow Drip: 12s gap keeps us safely under Groq free-tier rate limits
                if (processed < BATCH_SIZE) {
                    await new Promise((resolve) => setTimeout(resolve, INTER_REQUEST_DELAY_MS));
                }
            } catch (err) {
                logger.error(`[Pipeline] ❌ Summarization Failed! ID: ${rawNews._id} | Title: "${rawNews.title || 'Untitled'}" | Reason: ${err.message}`);
                failed++;
            }
        }

        // ─── Re-summarization pass: fix fallback articles ────────────────────
        // Articles that fell back to raw text have empty tags[]. Pick them up
        // and re-summarize now that the rate-limit window has likely reset.
        let resummarized = 0;
        const News = require('../models/News');
        const { summarizeNews } = require('../services/groqSummarizer');

        const fallbackArticles = await News.find({
            tags: { $exists: true, $size: 0 },
            rawNewsId: { $exists: true, $ne: null },
            status: { $in: ['review', 'draft'] },
        })
            .sort({ createdAt: -1 })
            .limit(RESUMMARIZE_BATCH)
            .populate('rawNewsId');

        for (const article of fallbackArticles) {
            const raw = article.rawNewsId;
            if (!raw || !raw.content) continue;

            try {
                await new Promise((resolve) => setTimeout(resolve, INTER_REQUEST_DELAY_MS));
                logger.info(`[Pipeline] 🔄 Re-summarizing fallback: "${(article.title || 'Untitled').substring(0, 80)}..."`);

                const { title: newTitle, summary: newSummary, tags: newTags } = await summarizeNews(raw.title, raw.content);

                // Only update if AI actually succeeded (non-empty tags = AI worked)
                if (newTags && newTags.length > 0) {
                    await News.findByIdAndUpdate(article._id, {
                        title: newTitle,
                        summary: newSummary,
                        content: newSummary,
                        tags: newTags,
                    });
                    resummarized++;
                    logger.info(`[Pipeline] ✅ Re-summarized: ${article._id}`);
                }
            } catch (err) {
                logger.warn(`[Pipeline] Re-summarization failed for ${article._id}: ${err.message}`);
            }
        }

        logger.info(`[Pipeline] 🧠 Summarization Complete! Processed: ${processed}, Failed: ${failed}, Re-summarized: ${resummarized}`);
        return { processed, failed, resummarized };
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
