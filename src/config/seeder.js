'use strict';

/**
 * Database Seeder
 * Seeds initial admin, categories, and sample news data.
 * Run: node src/config/seeder.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Category = require('../models/Category');
const Language = require('../models/Language');
const logger = require('../utils/logger');

const CATEGORIES = [
    { name: 'Politics', nameInTelugu: 'రాజకీయాలు', slug: 'politics', icon: '🏛️', color: '#E53935', order: 1 },
    { name: 'Business', nameInTelugu: 'వ్యాపారం', slug: 'business', icon: '💼', color: '#1565C0', order: 2 },
    { name: 'Sports', nameInTelugu: 'క్రీడలు', slug: 'sports', icon: '🏏', color: '#2E7D32', order: 3 },
    { name: 'Technology', nameInTelugu: 'టెక్నాలజీ', slug: 'technology', icon: '💻', color: '#6A1B9A', order: 4 },
    { name: 'Health', nameInTelugu: 'ఆరోగ్యం', slug: 'health', icon: '🏥', color: '#00838F', order: 5 },
    { name: 'Entertainment', nameInTelugu: 'వినోదం', slug: 'entertainment', icon: '🎬', color: '#AD1457', order: 6 },
    { name: 'Crime', nameInTelugu: 'నేరాలు', slug: 'crime', icon: '⚖️', color: '#4E342E', order: 7 },
    { name: 'Weather', nameInTelugu: 'వాతావరణం', slug: 'weather', icon: '🌧️', color: '#0277BD', order: 8 },
    { name: 'Education', nameInTelugu: 'విద్య', slug: 'education', icon: '📚', color: '#F57F17', order: 9 },
    { name: 'General', nameInTelugu: 'సాధారణ', slug: 'general', icon: '📰', color: '#546E7A', order: 10 },
];

const LANGUAGES = [
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
];

const seed = async () => {
    try {
        // Only connect if mongoose isn't already connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI);
            logger.info('Connected to MongoDB for seeding');
        }

        // Seed categories (upsert by slug)
        for (const cat of CATEGORIES) {
            await Category.findOneAndUpdate({ slug: cat.slug }, cat, { upsert: true, new: true });
        }
        logger.info(`Bootstrap: Ensured ${CATEGORIES.length} categories exist`);

        // Seed languages (upsert by code)
        for (const lang of LANGUAGES) {
            await Language.findOneAndUpdate({ code: lang.code }, lang, { upsert: true, new: true });
        }
        logger.info(`Bootstrap: Ensured ${LANGUAGES.length} languages exist`);

        // Seed super admin if not exists
        const existing = await User.findOne({ email: process.env.ADMIN_EMAIL || 'admin@vivadigitalnews.com' });
        if (!existing) {
            await User.create({
                name: 'Super Admin',
                email: process.env.ADMIN_EMAIL || 'admin@vivadigitalnews.com',
                phone: process.env.ADMIN_PHONE || '9999999999',
                password: process.env.ADMIN_PASSWORD || 'Admin@SecurePass123!',
                role: 'super_admin',
                permissions: {
                    manageNews: true,
                    manageUsers: true,
                    manageContributors: true,
                    sendNotifications: true,
                    viewAnalytics: true,
                },
            });
            logger.info('Bootstrap: Created Super Admin user');
        }

        logger.info('✅ Bootstrap/Seeding checks complete');
    } catch (err) {
        logger.error('Bootstrap/Seeding failed:', err);
        // We don't exit the process here so the server can still attempt to start
    }
};

// If run directly: node src/config/seeder.js
if (require.main === module) {
    seed().then(() => process.exit(0));
}

module.exports = seed;

