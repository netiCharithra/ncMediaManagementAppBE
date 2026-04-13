const mongoose = require('mongoose');
const path = require('path');
const rootDir = process.cwd();
require('dotenv').config({ path: path.join(rootDir, '.env') });

const News = require(path.join(rootDir, 'src/models/News'));

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const total = await News.countDocuments();
        const review = await News.countDocuments({ status: 'review' });
        const missingImage = await News.countDocuments({ 
            status: { $in: ['published', 'review'] },
            $or: [
                { imageUrl: { $exists: false } },
                { imageUrl: null },
                { imageUrl: '' }
            ]
        });

        console.log('--- Stats ---');
        console.log('Total News:', total);
        console.log('In Review:', review);
        console.log('Missing Images:', missingImage);

        if (review > 0) {
            console.log('\nSample Review Items:');
            const samples = await News.find({ status: 'review' }).sort({ createdAt: -1 }).limit(5).select('title imageUrl');
            samples.forEach(s => console.log(`- ${s.title}\n  Image: ${s.imageUrl || 'MISSING'}`));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
