'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
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
const colabRoutes = require('./routes/colab.routes');
const setupSwagger = require('./config/swagger');


const app = express();

// ─── Request ID & Security Middleware ──────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(helmet());
app.use(mongoSanitize());

// ─── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.VIVA_DIGITAL_ALLOWED_ORIGINS || '').split(',').filter(Boolean);
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
    windowMs: parseInt(process.env.VIVA_DIGITAL_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.VIVA_DIGITAL_RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ─── Body Parsing & Compression ───────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── HTTP Observability Logging ──────────────────────────────────────────────
const SENSITIVE_KEYS = new Set(['password', 'pass', 'token', 'accessToken', 'refreshToken', 'authorization', 'secret', 'apiKey']);
const LOG_HTTP_BODY = process.env.VIVA_DIGITAL_LOG_HTTP_BODY === 'true';

const sanitizePayload = (value) => {
    if (Array.isArray(value)) return value.map(sanitizePayload);
    if (!value || typeof value !== 'object') return value;

    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
        if (SENSITIVE_KEYS.has(key)) {
            sanitized[key] = '***REDACTED***';
        } else {
            sanitized[key] = sanitizePayload(val);
        }
    }
    return sanitized;
};

app.use((req, res, next) => {
    const start = process.hrtime.bigint();

    logger.infoEvent('http.request.started', {
        component: 'HTTP',
        method: req.method,
        path: req.originalUrl || req.url,
        ip: req.ip,
        user_agent: req.get('user-agent'),
        content_type: req.get('content-type'),
    });

    res.on('finish', () => {
        const durationMs = Number((process.hrtime.bigint() - start) / 1000000n);
        const statusCode = res.statusCode;
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
        const logFn = level === 'error' ? logger.errorEvent : level === 'warn' ? logger.warnEvent : logger.infoEvent;

        const fields = {
            component: 'HTTP',
            method: req.method,
            path: req.originalUrl || req.url,
            status_code: statusCode,
            duration_ms: durationMs,
            ip: req.ip,
            user_agent: req.get('user-agent'),
            request_bytes: req.get('content-length') ? Number(req.get('content-length')) : undefined,
            response_bytes: res.getHeader('content-length') ? Number(res.getHeader('content-length')) : undefined,
            user_id: req.user?._id ? String(req.user._id) : undefined,
        };

        if (LOG_HTTP_BODY && req.body && Object.keys(req.body).length > 0) {
            fields.request_body = sanitizePayload(req.body);
        }

        logFn('http.request.completed', fields);
    });

    next();
});

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
        logger.errorEvent('health.partial_failure', {
            component: 'Health',
            error: err.message,
            stack: err.stack,
        });
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
app.use('/api/colab_ngrok', colabRoutes);
app.use('/admin', adminRoutes);
app.use('/contributor', contributorRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
