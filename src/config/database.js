'use strict';

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI is not defined in environment variables');

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    });

    mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
    });

    mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
    });
};

module.exports = connectDB;
