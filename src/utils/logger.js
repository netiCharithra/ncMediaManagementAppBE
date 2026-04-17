'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const os = require('os');

const logDir = process.env.VIVA_DIGITAL_LOG_DIR || 'logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { LoggingWinston } = require('@google-cloud/logging-winston');

const { getRequestId } = require('./requestId');

const {
    combine,
    timestamp,
    printf,
    colorize,
    errors,
    splat,
    json,
} = winston.format;

const SERVICE_NAME = process.env.SERVICE_NAME || 'viva-digital-news-backend';
const LOG_LEVEL = process.env.VIVA_DIGITAL_LOG_LEVEL || 'info';
const PRETTY_CONSOLE = process.env.LOG_PRETTY !== 'false';

const extractBracketTags = (message) => {
    if (typeof message !== 'string') return null;
    const match = message.match(/^(?:\[([^\]]+)\])(?:\[([^\]]+)\])?(?:\[([^\]]+)\])?\s*(.*)$/);
    if (!match) return null;

    const [, first, second, third, rest] = match;
    return {
        first: first || null,
        second: second || null,
        third: third || null,
        rest: rest || '',
    };
};

const normalizeLevel = (statusCode) => {
    if (typeof statusCode !== 'number') return 'info';
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
};

const toSeverity = (level) => {
    const normalized = String(level || 'info').toLowerCase();
    if (normalized === 'error') return 'ERROR';
    if (normalized === 'warn' || normalized === 'warning') return 'WARNING';
    if (normalized === 'debug' || normalized === 'verbose') return 'DEBUG';
    if (normalized === 'silly' || normalized === 'trace') return 'DEFAULT';
    return 'INFO';
};

const enrichLogInfo = winston.format((info) => {
    const requestId = getRequestId();
    if (requestId && !info.request_id) {
        info.request_id = requestId;
    }

    if (!info.service) info.service = SERVICE_NAME;
    if (!info.environment) info.environment = process.env.NODE_ENV || 'development';
    if (!info.hostname) info.hostname = os.hostname();
    if (!info.pid) info.pid = process.pid;

    const parsed = extractBracketTags(info.message);
    if (parsed) {
        if (!info.component) info.component = parsed.first;
        if (!info.provider && parsed.second && !parsed.third) info.provider = parsed.second;
        if (!info.provider && parsed.second && parsed.third) info.provider = parsed.second;
        if (!info.event && parsed.third) info.event = parsed.third;
        if (!info.message_detail) info.message_detail = parsed.rest;
    }

    if (!info.level && typeof info.status_code === 'number') {
        info.level = normalizeLevel(info.status_code);
    }
    if (!info.severity) {
        info.severity = toSeverity(info.level);
    }

    return info;
});

const prettyTextFormat = printf((info) => {
    const requestIdStr = info.request_id ? ` [${String(info.request_id).split('-')[0]}]` : '';
    const detail = info.stack || info.message;
    return `[${info.timestamp}]${requestIdStr} ${info.level}: ${detail}`;
});

const logger = winston.createLogger({
    level: LOG_LEVEL,
    defaultMeta: {
        service: SERVICE_NAME,
        environment: process.env.NODE_ENV || 'development',
    },
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        splat(),
        enrichLogInfo()
    ),
    transports: [
        // Console (dev only)
        ...(process.env.NODE_ENV !== 'production' && PRETTY_CONSOLE
            ? [
                new winston.transports.Console({
                    format: combine(
                        colorize(),
                        timestamp({ format: 'HH:mm:ss' }),
                        errors({ stack: true }),
                        splat(),
                        enrichLogInfo(),
                        prettyTextFormat
                    ),
                }),
            ]
            : []),

        // Single rotating file – structured JSON for observability dashboards
        new DailyRotateFile({
            filename: path.join(logDir, 'observability-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '50m',
            maxFiles: '30d',
            format: combine(
                timestamp(),
                errors({ stack: true }),
                splat(),
                enrichLogInfo(),
                json()
            ),
        }),

        ...((process.env.VIVA_DIGITAL_GOOGLE_APPLICATION_CREDENTIALS !== undefined
            || process.env.GOOGLE_CLOUD_PROJECT !== undefined
            || process.env.NODE_ENV === 'production')
            && process.env.VIVA_DIGITAL_PAUSE_GCP_LOGGING !== 'true'
            && process.env.PAUSE_GCP_LOGGING !== 'true'
            ? [new LoggingWinston(
                process.env.VIVA_DIGITAL_GOOGLE_APPLICATION_CREDENTIALS 
                ? { keyFilename: process.env.VIVA_DIGITAL_GOOGLE_APPLICATION_CREDENTIALS } 
                : {}
            )]
            : [])
    ],
});

logger.event = (level, event, fields = {}) => {
    logger.log({
        level,
        event,
        message: event,
        ...fields,
    });
};

logger.infoEvent = (event, fields = {}) => logger.event('info', event, fields);
logger.warnEvent = (event, fields = {}) => logger.event('warn', event, fields);
logger.errorEvent = (event, fields = {}) => logger.event('error', event, fields);

module.exports = logger;
