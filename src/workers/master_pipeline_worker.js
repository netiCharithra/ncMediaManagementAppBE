'use strict';

/**
 * master_pipeline_worker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The professional "Full Run" script. 
 * Sequentially executes all stages of the news pipeline:
 * Ingestion -> Summarization -> Translation -> Images.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const connectDB = require('../config/database');
const { connectRedis } = require('../config/redis');
const logger = require('../utils/logger');

// Import stage runners
const { run: runIngestion } = require('./rss_ingestion_worker');
const { run: runSummarization } = require('./summarization_worker');
const { run: runTranslation } = require('./translation_worker');
const { run: runImages } = require('./newsWorker');

const runMasterPipeline = async () => {
    logger.info('========================================================================');
    logger.info('🚀 STARTING FULL MASTER PIPELINE RUN (MANUAL OVERRIDE)');
    logger.info('========================================================================');
    
    const startTime = Date.now();

    try {
        await connectDB();
        await connectRedis();

        // ── Stage 1: RSS Ingestion ──────────────────────────────────────────
        logger.info('[Master] Stage 1/4: Pulling latest RSS feeds...');
        const rssStats = await runIngestion() || {};

        // ── Stage 2: Summarization (AI Pipeline) ─────────────────────────────
        logger.info('[Master] Stage 2/4: Summarizing pending articles...');
        const sumStats = await runSummarization() || {};

        // ── Stage 3: Translation ─────────────────────────────────────────────
        logger.info('[Master] Stage 3/4: Translating review-ready articles...');
        const transStats = await runTranslation() || {};

        // ── Stage 4: Image Generation ────────────────────────────────────────
        logger.info('[Master] Stage 4/4: Generating AI images (Batch of 10)...');
        const imageStats = await runImages() || {};

        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

        logger.info('========================================================================');
        logger.info('✅ FULL PIPELINE COMPLETE!');
        logger.info(`⏱️ Total Time: ${duration} minutes`);
        logger.info(`📊 STATS: 
           - RSS New: ${rssStats.totalNew || 0}
           - Summarized: ${sumStats.processed || 0}
           - Translated: ${transStats.success || 0}
           - Images Generated: ${imageStats.processed || 0}`);
        logger.info('========================================================================');

        process.exit(0);
    } catch (err) {
        logger.error('[Master] ❌ Fatal error in Master Pipeline:', err.message);
        process.exit(1);
    }
};

runMasterPipeline();
