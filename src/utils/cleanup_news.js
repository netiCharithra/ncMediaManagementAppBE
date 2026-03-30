'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const RawNews = require('../models/RawNews');
const News = require('../models/News');
const NewsTranslation = require('../models/NewsTranslation');
const logger = require('../utils/logger');

const cleanup = async () => {
    try {
        await connectDB();

        logger.info('Cleaning up News, RawNews and NewsTranslation collections...');

        const rawRes = await RawNews.deleteMany({});
        const newsRes = await News.deleteMany({});
        const transRes = await NewsTranslation.deleteMany({});

        logger.info(`Cleanup complete:
            - RawNews: ${rawRes.deletedCount} removed
            - News: ${newsRes.deletedCount} removed
            - NewsTranslation: ${transRes.deletedCount} removed`);

        process.exit(0);
    } catch (err) {
        logger.error('Cleanup failed:', err);
        process.exit(1);
    }
};

cleanup();
