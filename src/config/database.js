'use strict';

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// ─── Register connection lifecycle listeners ONCE at module load ────────────
// Attaching these inside connectDB() would register a new listener every time
// the function is called (e.g., by background workers), causing the Node.js
// MaxListenersExceededWarning after ~10 calls.
mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err);
});

const connectDB = async () => {
    const uri = process.env.VIVA_DIGITAL_MONGO_URI;
    if (!uri) throw new Error('MONGO_URI is not defined in environment variables');

    // Skip if already connected or connecting
    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
        return;
    }

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    });
};

module.exports = connectDB;
