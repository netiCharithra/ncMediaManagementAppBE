'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const { connectRedis } = require('../config/redis');
const { ingestRSSFeeds } = require('../services/ingestion.service');
const logger = require('../utils/logger');

/**
 * Standalone RSS ingestion worker.
 * Can be run directly: node src/workers/rss_ingestion_worker.js
 * Or scheduled via cron.
 */
const run = async () => {
    logger.info('[RSS Worker] Starting RSS ingestion...');
    try {
        await connectDB();
        await connectRedis();

        const summary = await ingestRSSFeeds();
        logger.info('[RSS Worker] Completed:', summary);
        return summary;
    } catch (err) {
        logger.error('[RSS Worker] Fatal error:', err);
        if (require.main === module) process.exit(1);
    } finally {
        if (require.main === module) process.exit(0);
    }
};

// Run directly if called from CLI
if (require.main === module) {
    run();
}

module.exports = { run };
