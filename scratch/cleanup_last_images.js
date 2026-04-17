const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const News = require('../src/models/News');
const NewsTranslation = require('../src/models/NewsTranslation');
const connectDB = require('../src/config/database');

const run = async () => {
    try {
        await connectDB();
        console.log('--- Connected to DB ---');

        // 1. Find the 10 most recently updated news articles that HAVE an image
        const newsToReset = await News.find({ 
            imageUrl: { $exists: true, $ne: null, $ne: '' } 
        })
        .sort({ updatedAt: -1 })
        .limit(10);

        if (newsToReset.length === 0) {
            console.log('No news articles found with images to reset.');
            process.exit(0);
        }

        console.log(`Found ${newsToReset.length} records to reset.`);

        for (const article of newsToReset) {
            console.log(`\nResetting: "${article.title}"`);
            console.log(`Current URL: ${article.imageUrl}`);

            // Clear from News collection
            article.imageUrl = null;
            await article.save();
            console.log('- Cleared from News collection.');

            // Clear from NewsTranslation siblings
            const transResult = await NewsTranslation.updateMany(
                { newsId: article.parentNewsId || article._id },
                { $set: { imageUrl: null } }
            );
            console.log(`- Cleared from ${transResult.modifiedCount} translations.`);
        }

        console.log('\n✅ Cleanup complete. You can now re-run the image worker.');
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
};

run();
