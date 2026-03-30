'use strict';

const logger = require('../utils/logger');

/**
 * Global error handler middleware.
 */
const errorHandler = (err, req, res, _next) => {
    let { statusCode = 500, message, isOperational } = err;

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        statusCode = 422;
        message = Object.values(err.errors)
            .map((e) => e.message)
            .join(', ');
        isOperational = true;
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0] || 'field';
        message = `Duplicate value for ${field}. Please use a different value.`;
        isOperational = true;
    }

    // Mongoose CastError (invalid ObjectId)
    if (err.name === 'CastError') {
        statusCode = 400;
        message = `Invalid value for field: ${err.path}`;
        isOperational = true;
    }

    // JWT errors are handled in middleware but catch here as fallback
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
        isOperational = true;
    }

    if (!isOperational) {
        logger.error('Unexpected error:', {
            message: err.message,
            stack: err.stack,
            url: req.originalUrl,
            method: req.method,
        });
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

/**
 * 404 handler for unmatched routes.
 */
const notFound = (req, res, next) => {
    const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
    err.statusCode = 404;
    err.isOperational = true;
    next(err);
};

module.exports = { errorHandler, notFound };
