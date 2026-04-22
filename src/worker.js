'use strict';

/**
 * ============================================================================
 *  Viva Digital News — Background Worker Process (PM2 Process B)
 * ============================================================================
 *  This is the standalone entry point for the background job scheduler.
 *  It is intentionally kept separate from the API server (server.js) so that
 *  heavy AI tasks (Summarisation, Translation, Image Generation) cannot crash
 *  or slow down the public-facing Express API.
 *
 *  On EC2 with PM2, this runs as a completely independent OS process:
 *    pm2 start src/worker.js --name "viva-worker"
 *
 *  This process:
 *    ✅ Connects to MongoDB (idempotent — safe if already connected)
 *    ✅ Connects to Redis (required by cache utils used inside workers)
 *    ✅ Schedules all cron jobs via cronScheduler
 *    ✅ Handles graceful shutdown on SIGTERM / SIGINT
 *    ✅ Handles unhandledRejection / uncaughtException without bringing down the API
 * ============================================================================
 */

require('dotenv').config();
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const { scheduleCronJobs } = require('./workers/cronScheduler');
const logger = require('./utils/logger');

const startWorker = async () => {
    try {
        // ── Step 1: Connect to MongoDB ────────────────────────────────────────
        await connectDB();
        logger.infoEvent('startup.mongodb.connected', {
            component: 'Worker',
        });

        // ── Step 2: Connect to Redis ──────────────────────────────────────────
        await connectRedis();
        logger.infoEvent('startup.redis.connected', {
            component: 'Worker',
        });

        // ── Step 3: Start all cron jobs ───────────────────────────────────────
        scheduleCronJobs();
        logger.infoEvent('startup.cron.scheduled', {
            component: 'Worker',
        });

        logger.infoEvent('startup.worker.ready', {
            component: 'Worker',
            environment: process.env.NODE_ENV || 'development',
        });

        // ── Step 4: Graceful shutdown ─────────────────────────────────────────
        // PM2 sends SIGINT on `pm2 stop` and SIGTERM on `pm2 delete`.
        // We log the signal and exit cleanly so cron jobs don't hang mid-run.
        const shutdown = (signal) => {
            logger.warnEvent('shutdown.signal.received', {
                component: 'Worker',
                signal,
            });
            // node-cron jobs are in-process; exiting cleanly stops them.
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT',  () => shutdown('SIGINT'));

        // ── Step 5: Process-level safety nets ─────────────────────────────────
        // These prevent a single bad AI response from silently killing the process.
        // PM2 will auto-restart if process.exit(1) is called.
        process.on('unhandledRejection', (err) => {
            logger.errorEvent('process.unhandled_rejection', {
                component: 'Worker',
                error: err?.message || String(err),
                stack: err?.stack,
            });
            // Do NOT exit here — a bad AI call should not kill the entire scheduler.
            // The cron job's own try/catch already handles it.
        });

        process.on('uncaughtException', (err) => {
            logger.errorEvent('process.uncaught_exception', {
                component: 'Worker',
                error: err?.message || String(err),
                stack: err?.stack,
            });
            // This is a truly fatal error — let PM2 restart us.
            process.exit(1);
        });

    } catch (error) {
        logger.errorEvent('startup.failed', {
            component: 'Worker',
            error: error?.message || String(error),
            stack: error?.stack,
        });
        process.exit(1);
    }
};

startWorker();
