'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const logger = require('./utils/logger');
const { getRedisClient } = require('./config/redis');
const { requestIdMiddleware } = require('./utils/requestId');
const { errorHandler, notFound } = require('./middlewares/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const mpinRoutes = require('./routes/mpin.routes');
const newsRoutes = require('./routes/news.routes');
const adminRoutes = require('./routes/admin.routes');
const contributorRoutes = require('./routes/contributor.routes');
const notificationRoutes = require('./routes/notification.routes');
const categoryRoutes = require('./routes/category.routes');
const communityRoutes = require('./routes/community.routes');
const setupSwagger = require('./config/swagger');


const app = express();

// ─── Request ID & Security Middleware ──────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(helmet());
app.use(mongoSanitize());

// ─── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
    })
);

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ─── Body Parsing & Compression ───────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Request & Payload Logging ────────────────────────────────────────────────
app.use((req, res, next) => {
    logger.info(`[API Hit] ${req.method} ${req.originalUrl}`);

    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
        logger.info('Payload: [multipart/form-data — fields logged post-multer]');
    } else if (req.body && Object.keys(req.body).length > 0) {
        const safeBody = { ...req.body };
        if (safeBody.password) safeBody.password = '********';
        logger.info(`Payload: ${JSON.stringify(safeBody, null, 2)}`);
    }
    next();
});


// ─── HTTP Request Logging ─────────────────────────────────────────────────────
app.use(
    morgan('combined', {
        stream: { write: (msg) => logger.http(msg.trim()) },
        skip: () => process.env.NODE_ENV === 'test',
    })
);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
    let mongoStatus = 'disconnected';
    let redisStatus = 'disconnected';

    try {
        if (mongoose.connection.readyState === 1) {
            mongoStatus = 'connected';
        }
        
        const redis = getRedisClient();
        if (redis.status === 'ready') {
            redisStatus = 'connected';
        }
    } catch (err) {
        logger.error('Health check partial failure:', err);
    }

    const isHealthy = mongoStatus === 'connected' && redisStatus === 'connected';

    res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        message: isHealthy ? 'Viva Digital News API is healthy' : 'Viva Digital News API is degraded',
        database: mongoStatus,
        redis: redisStatus,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
    });
});

// ─── Swagger Documentation ───────────────────────────────────────────────────
setupSwagger(app);


// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auth', mpinRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/community', communityRoutes);
app.use('/admin', adminRoutes);
app.use('/contributor', contributorRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
