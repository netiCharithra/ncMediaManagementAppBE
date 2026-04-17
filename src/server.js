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
        logger.infoEvent('startup.mongodb.connected', {
            component: 'Server',
        });

        // Bootstrap initial data (admin and categories)
        await bootstrapData();


        // Connect to Redis
        await connectRedis();
        logger.infoEvent('startup.redis.connected', {
            component: 'Server',
        });

        // Schedule background cron workers
        if (process.env.VIVA_DIGITAL_DISABLE_CRON !== 'true') {
            scheduleCronJobs();
            logger.infoEvent('startup.cron.scheduled', {
                component: 'Server',
                disable_cron: false,
            });
        } else {
            logger.warnEvent('startup.cron.skipped', {
                component: 'Server',
                disable_cron: true,
                reason: 'DISABLE_CRON=true',
            });
        }

        const server = app.listen(PORT, () => {
            logger.infoEvent('startup.server.ready', {
                component: 'Server',
                port: Number(PORT),
                environment: process.env.NODE_ENV || 'development',
            });
        });

        // Graceful shutdown
        const shutdown = (signal) => {
            logger.warnEvent('shutdown.signal.received', {
                component: 'Server',
                signal,
            });
            server.close(() => {
                logger.infoEvent('shutdown.http.closed', {
                    component: 'Server',
                });
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        process.on('unhandledRejection', (err) => {
            logger.errorEvent('process.unhandled_rejection', {
                component: 'Server',
                error: err?.message || String(err),
                stack: err?.stack,
            });
            server.close(() => process.exit(1));
        });

        process.on('uncaughtException', (err) => {
            logger.errorEvent('process.uncaught_exception', {
                component: 'Server',
                error: err?.message || String(err),
                stack: err?.stack,
            });
            process.exit(1);
        });
    } catch (error) {
        logger.errorEvent('startup.failed', {
            component: 'Server',
            error: error?.message || String(error),
            stack: error?.stack,
        });
        process.exit(1);
    }
};

startServer();
