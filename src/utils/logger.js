'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const logDir = process.env.LOG_DIR || 'logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { LoggingWinston } = require('@google-cloud/logging-winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
    return `[${ts}] ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: [
        // Console (dev only)
        ...(process.env.NODE_ENV !== 'production'
            ? [
                new winston.transports.Console({
                    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
                }),
            ]
            : []),

        // Rotating file – combined
        new DailyRotateFile({
            filename: path.join(logDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
        }),

        // Rotating file – errors only
        new DailyRotateFile({
            level: 'error',
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '30d',
        }),

        // Google Cloud Logging (Will auto-activate if credentials are set)
        ...(process.env.GOOGLE_APPLICATION_CREDENTIALS !== undefined 
            || process.env.GOOGLE_CLOUD_PROJECT !== undefined 
            || process.env.NODE_ENV === 'production' 
            ? [new LoggingWinston()] 
            : [])
    ],
});

module.exports = logger;
