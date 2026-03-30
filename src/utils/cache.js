'use strict';

const { getRedisClient } = require('../config/redis');
const logger = require('./logger');

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get a cached value. Returns null on cache miss or error.
 */
const getCache = async (key) => {
    try {
        const client = getRedisClient();
        const data = await client.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        logger.warn(`Cache GET failed for key "${key}":`, err.message);
        return null;
    }
};

/**
 * Set a cached value with optional TTL in seconds.
 */
const setCache = async (key, value, ttl = DEFAULT_TTL) => {
    try {
        const client = getRedisClient();
        await client.setex(key, ttl, JSON.stringify(value));
    } catch (err) {
        logger.warn(`Cache SET failed for key "${key}":`, err.message);
    }
};

/**
 * Delete one or more cache keys.
 */
const delCache = async (...keys) => {
    try {
        const client = getRedisClient();
        if (keys.length > 0) await client.del(...keys);
    } catch (err) {
        logger.warn('Cache DEL failed:', err.message);
    }
};

/**
 * Delete all keys matching a pattern (uses SCAN to avoid blocking).
 */
const clearCachePattern = async (pattern) => {
    try {
        const client = getRedisClient();
        let cursor = '0';
        do {
            const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) await client.del(...keys);
        } while (cursor !== '0');
    } catch (err) {
        logger.warn(`Cache pattern clear failed for "${pattern}":`, err.message);
    }
};

/**
 * Express middleware: returns cached response if available.
 */
const cacheMiddleware = (keyFn, ttl = DEFAULT_TTL) => {
    return async (req, res, next) => {
        const key = typeof keyFn === 'function' ? keyFn(req) : keyFn;
        const cached = await getCache(key);
        if (cached) {
            return res.status(200).json({ success: true, cached: true, ...cached });
        }

        // Monkey-patch res.json to intercept and cache response
        const originalJson = res.json.bind(res);
        res.json = async (body) => {
            if (res.statusCode === 200 && body && body.success) {
                const { success, cached: _c, ...rest } = body;
                await setCache(key, rest, ttl);
            }
            return originalJson(body);
        };

        next();
    };
};

module.exports = { getCache, setCache, delCache, clearCachePattern, cacheMiddleware };
