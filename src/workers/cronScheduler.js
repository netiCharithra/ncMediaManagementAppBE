'use strict';

const cron = require('node-cron');
const logger = require('../utils/logger');

/**
 * Schedule all background cron workers.
 * Workers are required lazily to allow this file to load before DB is connected.
 */
const scheduleCronJobs = () => {
    logger.info('========================================================================');
    logger.info('   📅 CURRENT ACTIVE SCHEDULE DASHBOARD (VIVA DIGITAL NEWS)            ');
    logger.info('------------------------------------------------------------------------');
    logger.info('   1. Master Pipeline  --> [*/10 MINS] --> (Sequential Flow)            ');
    logger.info('   2. Catch-up Worker  --> [*/5 MINS]  --> (Summarize + Translate)      ');
    logger.info('   3. Image Safety Net --> [*/5 MINS]  --> (Hugging Face / R2)          ');
    logger.info('   4. Trending Refresh --> [HOURLY]    --> (Views Ranker)               ');
    logger.info('   5. Daily Summary    --> [11:59PM IST]                                ');
    logger.info('========================================================================');

    // ─── Master Continuous Pipeline: Every 10 minutes ──────────────────────────
    // Executes sequentially: Pull -> Summarize -> Translate without idle waiting.
    cron.schedule('*/10 * * * *', async () => {
        logger.info('[Cron] 🚀 Triggering Master Sequential Pipeline...');
        try {
            let rssStats = {};
            if (process.env.VIVA_DIGITAL_DISABLE_RSS !== 'true') {
                logger.info('[Cron] Step 1: Initiating RSS Ingestion...');
                const { run: runIngestion } = require('./rss_ingestion_worker');
                rssStats = await runIngestion() || {};
            } else {
                logger.info('[Cron] Step 1: RSS Ingestion Skipped (DISABLE_RSS=true)...');
            }

            logger.info('[Cron] Step 2: RSS complete. Initiating Summarization...');
            const { run: runSummarization } = require('./summarization_worker');
            const sumStats = await runSummarization() || {};

            logger.info('[Cron] Step 3: Summaries complete. Initiating Translation...');
            const { run: runTranslation } = require('./translation_worker');
            const transStats = await runTranslation() || {};

            logger.info('[Cron] Step 4: Translations complete. Initiating Image Generation...');
            const { run: runImages } = require('./newsWorker');
            const imageStats = await runImages() || {};

            logger.info('========================================================================');
            logger.info(`[Cron] 📊 CYCLE SUMMARY: | Fetched: ${rssStats.totalNew || 0} | Summarized: ${sumStats.processed || 0} | Translated: ${transStats.success || 0} | Images: ${imageStats.processed || 0} |`);
            logger.info('========================================================================');
            logger.info('[Cron] ✅ Master Pipeline Cycle Completed flawlessly!');
        } catch (err) {
            logger.error('[Cron] ❌ Master Pipeline encountered an error:', err.message);
        }
    });

    // ─── Trending recalculation: every hour ───────────────────────────────────
    cron.schedule('0 * * * *', async () => {
        logger.info('[Cron] Recalculating trending news...');
        try {
            const News = require('../models/News');
            const { clearCachePattern } = require('../utils/cache');

            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Reset old trending flags
            await News.updateMany({ isTrending: true }, { isTrending: false });

            // Mark top 20 by views in last 24h as trending
            const trending = await News.find({ status: 'published', publishedAt: { $gte: cutoff } })
                .sort({ views: -1 })
                .limit(20)
                .select('_id');

            if (trending.length > 0) {
                await News.updateMany({ _id: { $in: trending.map((n) => n._id) } }, { isTrending: true });
            }

            await clearCachePattern('news:trending*');
            logger.info(`[Cron] Trending recalculated — ${trending.length} articles marked`);
        } catch (err) {
            logger.error('[Cron] Trending recalculation error:', err.message);
        }
    });

    // ─── End of Day IST Log Summary ──────────────────────────────────────────
    cron.schedule('59 23 * * *', async () => {
        try {
            const moment = require('moment-timezone');
            const RawNews = require('../models/RawNews');
            const News = require('../models/News');
            const NewsTranslation = require('../models/NewsTranslation');
            
            // Get start and end of today in exact IST
            const startOfDay = moment().tz('Asia/Kolkata').startOf('day').toDate();
            const endOfDay = moment().tz('Asia/Kolkata').endOf('day').toDate();

            const pulledToday = await RawNews.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } });
            
            const processedToday = await RawNews.countDocuments({ 
                processingStatus: 'processed', 
                updatedAt: { $gte: startOfDay, $lte: endOfDay } 
            });

            const failedToday = await RawNews.countDocuments({ 
                processingStatus: 'failed', 
                updatedAt: { $gte: startOfDay, $lte: endOfDay } 
            });

            const translatedToday = await NewsTranslation.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } });

            logger.info(`[Pipeline] 📅 EOD Summary (IST): Feeds Pulled: ${pulledToday} | Summarized: ${processedToday} (Failed: ${failedToday}) | Translated: ${translatedToday}`);
        } catch (err) {
            logger.error(`[Pipeline] ❌ EOD Summary Failed: ${err.message}`);
        }
    }, {
        timezone: "Asia/Kolkata"
    });

    // ─── AI Image Generation: every 5 minutes ────────────────────────────────
    // Finds published news with empty imageUrl, calls Gemini, uploads to R2.
    const { schedule: scheduleImageWorker } = require('./newsWorker');
    scheduleImageWorker();

    // ─── Catch-up Worker: Every 5 minutes ─────────────────────────────────────
    // Processes any pending RawNews articles that were missed by the 10-min pipe.
    cron.schedule('*/5 * * * *', async () => {
        logger.info('[Cron] 🔄 Triggering 5-minute Captch-up Worker (Summarize -> Translate)...');
        try {
            // Step 1: Summarize pending raw news
            const { run: runSummarization } = require('./summarization_worker');
            const sumStats = await runSummarization() || {};

            if (sumStats.processed > 0) {
                logger.info(`[Cron] 🔄 Summarized ${sumStats.processed} stragglers. Initiating Translation...`);
                // Step 2: Translate the newly summarized articles
                const { run: runTranslation } = require('./translation_worker');
                await runTranslation();
            } else {
                logger.info('[Cron] 🔄 No pending articles found for the catch-up worker.');
            }
        } catch (err) {
            logger.error('[Cron] ❌ Catch-up Worker error:', err.message);
        }
    });

    logger.info('[Cron] All jobs scheduled');
};

module.exports = { scheduleCronJobs };
