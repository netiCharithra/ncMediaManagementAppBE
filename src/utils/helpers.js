'use strict';

const crypto = require('crypto');

/**
 * Generate a SHA-256 content hash used for deduplication of raw news.
 * Normalises title + content before hashing.
 */
const generateContentHash = (title = '', content = '') => {
    const normalised = `${title.toLowerCase().replace(/\s+/g, ' ').trim()}|${content
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()}`;
    return crypto.createHash('sha256').update(normalised).digest('hex');
};

/**
 * Paginate a mongoose query result.
 */
const paginate = (page = 1, limit = 20) => {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    return { skip: (p - 1) * l, limit: l, page: p };
};

/**
 * Build a standard API response envelope.
 */
const apiResponse = (res, statusCode, data, message = 'Success') => {
    return res.status(statusCode).json({ success: true, message, ...data });
};

module.exports = { generateContentHash, paginate, apiResponse };
