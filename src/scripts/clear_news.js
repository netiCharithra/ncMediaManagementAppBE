'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const RawNews = require('../models/RawNews');
const News = require('../models/News');
const NewsTranslation = require('../models/NewsTranslation');
const logger = require('../utils/logger');

const clearAllNews = async () => {
    try {
        await connectDB();
        logger.info('⚠️ Connected to MongoDB. Wiping all news records permanently...');

        const rawNewsResult = await RawNews.deleteMany({});
        logger.info(`🗑️ Deleted ${rawNewsResult.deletedCount} items from RawNews collection.`);

        const newsResult = await News.deleteMany({});
        logger.info(`🗑️ Deleted ${newsResult.deletedCount} items from News collection.`);

        const translationResult = await NewsTranslation.deleteMany({});
        logger.info(`🗑️ Deleted ${translationResult.deletedCount} items from NewsTranslation collection.`);

        logger.info('✅ Database wipe complete! The pipeline is completely fresh.');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Failed to clear database:', error);
        process.exit(1);
    }
};

clearAllNews();
