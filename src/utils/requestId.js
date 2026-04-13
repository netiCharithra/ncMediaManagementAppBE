'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

// Global storage for the request ID
const requestIdStorage = new AsyncLocalStorage();

/**
 * Middleware to generate / capture a request ID and store it in AsyncLocalStorage.
 */
const requestIdMiddleware = (req, _res, next) => {
    // Check for incoming x-request-id if behind a proxy
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    requestIdStorage.run(requestId, () => {
        req.requestId = requestId;
        next();
    });
};

/**
 * Helper to get the current request ID from storage.
 */
const getRequestId = () => {
    return requestIdStorage.getStore();
};

module.exports = { requestIdMiddleware, getRequestId };
