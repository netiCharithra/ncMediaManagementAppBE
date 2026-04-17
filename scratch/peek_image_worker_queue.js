const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const News = require('../src/models/News');
const connectDB = require('../src/config/database');

const run = async () => {
    try {
        if (!process.env.MONGODB_URI && !process.env.VIVA_DIGITAL_MONGO_URI) {
           console.error('Environment variables:', Object.keys(process.env).filter(k => k.includes('MON')));
           throw new Error('MONGO_URI is not defined in environment variables');
        }
        await connectDB();
        console.log('--- Connected to DB ---');

        const pipeline = [
            {
                $match: {
                    status: { $in: ['published', 'review'] },
                    $or: [
                        { imageUrl: { $exists: false } },
                        { imageUrl: null },
                        { imageUrl: '' },
                    ],
                },
            },
            { $sort: { publishedAt: -1 } },
            {
                $addFields: {
                    storyKey: { $ifNull: ['$parentNewsId', '$_id'] },
                },
            },
            {
                $group: {
                    _id: '$storyKey',
                    repId: { $first: '$_id' },
                    repTitle: { $first: '$title' },
                    repSummary: { $first: '$summary' },
                    repTags: { $first: '$tags' },
                    publishedAt: { $first: '$publishedAt' },
                },
            },
            { $sort: { publishedAt: -1 } },
            { $limit: 2 },
        ];

        const results = await News.aggregate(pipeline);

        if (results.length === 0) {
            console.log('No records found matching the criteria.');
        } else {
            console.log(`Found ${results.length} records:`);
            results.forEach((r, i) => {
                console.log(`\nRecord ${i + 1}:`);
                console.log(`- ID: ${r.repId}`);
                console.log(`- Title: ${r.repTitle}`);
                console.log(`- Published At: ${r.publishedAt}`);
                console.log(`- Tags: ${JSON.stringify(r.repTags)}`);
            });
        }

        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
};

run();
