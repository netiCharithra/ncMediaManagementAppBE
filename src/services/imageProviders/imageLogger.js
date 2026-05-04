'use strict';
const logger = require('../../utils/logger');

const IMAGE_EVENTS = {
    REQUESTED: 'REQUESTED',
    WARNING: 'WARNING',
    SUCCESS: 'SUCCESS',
};

const imageInfo = (provider, event, message) => {
    logger.info(`[ImageService][${provider}][${event}] ${message}`);
};

const imageWarn = (provider, message) => {
    logger.warn(`[ImageService][${provider}][${IMAGE_EVENTS.WARNING}] ${message}`);
};

const trimError = (msg, max = 400) => {
    const text = String(msg || 'Unknown error').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
};

module.exports = { IMAGE_EVENTS, imageInfo, imageWarn, trimError };
