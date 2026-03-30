'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const { connectRedis } = require('../config/redis');
const News = require('../models/News');
const { translateContent } = require('../services/pipeline.service');
const logger = require('../utils/logger');

const TARGET_LANGUAGES = ['te', 'hi'];

/**
 * Translation worker.
 * Picks published news that hasn't been translated yet and translates them.
 */
const run = async () => {
    logger.info(`[Pipeline] 🗣️ Translation Worker Started...`);
    try {
        await connectDB();
        await connectRedis();

        const NewsTranslation = require('../models/NewsTranslation');

        // Find published news without Telugu translation
        const translatedIds = await NewsTranslation.distinct('newsId', { language: 'te' });
        const untranslated = await News.find({
            status: 'review',
            _id: { $nin: translatedIds },
        })
            .sort({ publishedAt: -1, createdAt: -1 }) // Newest translated first
            .limit(50)
            .lean();

        logger.info(`[Pipeline] 🗣️ Found ${untranslated.length} articles to translate`);

        let success = 0;
        let failed = 0;

        for (const news of untranslated) {
            try {
                logger.info(`[Pipeline] 🗣️ Translating: "${(news.title || 'Untitled').substring(0, 80)}..."`);
                await translateContent(news._id, news.title, news.summary, news.content, TARGET_LANGUAGES, {
                    imageUrl: news.imageUrl,
                    sourceUrl: news.sourceUrl,
                    sourceName: news.sourceName,
                    sourceType: news.sourceType,
                });
                success++;
                // Add a slightly larger delay for safety to stay below rate limits
                await new Promise((resolve) => setTimeout(resolve, 2000));
            } catch (err) {
                logger.error(`[Pipeline] ❌ Translation Failed! ID: ${news._id} | Title: "${news.title || 'Untitled'}" | Reason: ${err.message}`);
                failed++;
            }
        }

        logger.info(`[Pipeline] 🗣️ Translation Complete! Translated: ${success}, Failed: ${failed}`);
        return { success, failed };
    } catch (err) {
        logger.error('[Translation Worker] Fatal error:', err);
        if (require.main === module) process.exit(1);
    } finally {
        if (require.main === module) process.exit(0);
    }
};

if (require.main === module) {
    run();
}

module.exports = { run };
