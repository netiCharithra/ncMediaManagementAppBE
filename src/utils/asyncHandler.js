'use strict';

/**
 * Wraps an async route handler to eliminate try/catch boilerplate.
 * Forwards any thrown error to next().
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
