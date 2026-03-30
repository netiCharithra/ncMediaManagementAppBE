'use strict';

const jwt = require('jsonwebtoken');

/**
 * Generate an access token (short-lived).
 */
const generateAccessToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
};

/**
 * Generate a refresh token (long-lived).
 */
const generateRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    });
};

/**
 * Verify an access token.
 */
const verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Verify a refresh token.
 */
const verifyRefreshToken = (token) => {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
};
