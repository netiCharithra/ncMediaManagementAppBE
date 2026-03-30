'use strict';

require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const bootstrapData = require('./config/seeder');
const { scheduleCronJobs } = require('./workers/cronScheduler');


const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();
        logger.info('MongoDB connected successfully');

        // Bootstrap initial data (admin and categories)
        await bootstrapData();


        // Connect to Redis
        await connectRedis();
        logger.info('Redis connected successfully');

        // Schedule background cron workers
        if (process.env.DISABLE_CRON !== 'true') {
            scheduleCronJobs();
            logger.info('Cron jobs scheduled');
        } else {
            logger.info('⚠️ Cron jobs skipped (DISABLE_CRON=true)');
        }

        const server = app.listen(PORT, () => {
            logger.info(`Viva Digital News API running on port ${PORT} in ${process.env.NODE_ENV} mode`);
        });

        // Graceful shutdown
        const shutdown = (signal) => {
            logger.info(`${signal} received. Shutting down gracefully...`);
            server.close(() => {
                logger.info('HTTP server closed');
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        process.on('unhandledRejection', (err) => {
            logger.error('Unhandled Rejection:', err);
            server.close(() => process.exit(1));
        });

        process.on('uncaughtException', (err) => {
            logger.error('Uncaught Exception:', err);
            process.exit(1);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
