'use strict';

const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;

const connectRedis = async () => {
    redisClient = new Redis({
        host: process.env.VIVA_DIGITAL_REDIS_HOST || 'localhost',
        port: parseInt(process.env.VIVA_DIGITAL_REDIS_PORT) || 6379,
        password: process.env.VIVA_DIGITAL_REDIS_PASSWORD || undefined,
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        lazyConnect: true,
    });

    redisClient.on('connect', () => logger.info('Redis client connected'));
    redisClient.on('error', (err) => logger.error('Redis client error:', err));
    redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

    await redisClient.connect();
    return redisClient;
};

const getRedisClient = () => {
    if (!redisClient) throw new Error('Redis client not initialized. Call connectRedis() first.');
    return redisClient;
};

module.exports = { connectRedis: connectRedis, getRedisClient };
module.exports.default = connectRedis;
