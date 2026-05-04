'use strict';

/**
 * hfImageService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-provider AI image generation service with automatic fallback.
 * Provider logic is separated into imageProviders/ folder.
 */

const { uploadToCloud } = require('../utils/r2');
const logger = require('../utils/logger');
const { imageInfo, imageWarn, IMAGE_EVENTS, trimError } = require('./imageProviders/imageLogger');

// Import Providers
const { generateFromColab } = require('./imageProviders/colabProvider');
const { generateFromGemini } = require('./imageProviders/geminiProvider');
const { generateFromHuggingFace } = require('./imageProviders/huggingFaceProvider');
const { generateFromPollinations } = require('./imageProviders/pollinationsProvider');

// In-process cache: storyKey → R2 imageUrl
const _imageCache = new Map();

/**
 * Generate an image with rotating fallback.
 * @param {object} opts
 * @param {string[]} [opts.providerPrio] - Custom order, e.g., ['HuggingFace', 'Pollinations', 'Gemini']
 */
const generateAndUploadImage = async ({ title, summary = '', parentNewsId, providerPrio }) => {
    const startedAt = Date.now();
    const cacheKey = parentNewsId ? String(parentNewsId) : null;
    if (cacheKey && _imageCache.has(cacheKey)) {
        logger.infoEvent('image.generate.report', {
            component: 'ImageService',
            result: 'cache_hit',
            cache_key: cacheKey,
            selected_provider: 'cache',
            attempts: [],
            total_duration_ms: Date.now() - startedAt,
            title_excerpt: (title || '').substring(0, 120),
        });
        return { imageUrl: _imageCache.get(cacheKey), source: 'cache' };
    }

    // Default order if not specified
    const order = providerPrio || ['Colab', 'Gemini', 'HuggingFace', 'Pollinations'];

    let imageBuffer = null;
    let source = '';
    const errors = [];
    const attempts = [];

    // Iterate through providers in the specified order
    for (const provider of order) {
        const providerStart = Date.now();
        try {
            if (provider === 'Colab') {
                imageBuffer = await generateFromColab(title, summary);
                source = 'Colab';
            } else if (provider === 'Gemini') {
                imageBuffer = await generateFromGemini(title, summary);
                source = 'Gemini';
            } else if (provider === 'HuggingFace') {
                imageBuffer = await generateFromHuggingFace(title, summary);
                source = 'HuggingFace';
            } else if (provider === 'Pollinations') {
                imageBuffer = await generateFromPollinations(title, summary);
                source = 'Pollinations';
            }

            attempts.push({
                provider,
                status: 'success',
                duration_ms: Date.now() - providerStart,
            });
            if (imageBuffer) break; // Found one!
        } catch (err) {
            const errorMessage = trimError(err.message);
            if (!err?.alreadyLogged) {
                imageWarn(provider, `Provider failed: ${errorMessage}`);
            }
            attempts.push({
                provider,
                status: 'failed',
                duration_ms: Date.now() - providerStart,
                error: errorMessage,
            });
            errors.push(`${provider}: ${errorMessage}`);
        }
    }

    if (!imageBuffer) {
        logger.error(`[ImageService] ❌ All providers failed for "${title.substring(0, 50)}". Errors: ${errors.join(' | ')}`);
        logger.errorEvent('image.generate.report', {
            component: 'ImageService',
            result: 'failed',
            selected_provider: null,
            fallback_used: false,
            attempts,
            error_count: errors.length,
            total_duration_ms: Date.now() - startedAt,
            title_excerpt: (title || '').substring(0, 120),
        });
        return null;
    }

    try {
        const fileName = `news-${Date.now()}.png`;
        const publicUrl = await uploadToCloud(imageBuffer, fileName, 'image/png', 'ai-images');
        if (cacheKey) _imageCache.set(cacheKey, publicUrl);
        
        imageInfo(source, IMAGE_EVENTS.SUCCESS, `Image uploaded to R2 → ${publicUrl}`);
        logger.infoEvent('image.generate.report', {
            component: 'ImageService',
            result: 'success',
            selected_provider: source,
            fallback_used: attempts.length > 1,
            attempts,
            total_duration_ms: Date.now() - startedAt,
            cache_key: cacheKey,
            title_excerpt: (title || '').substring(0, 120),
        });
        return { imageUrl: publicUrl, source };
    } catch (uploadErr) {
        logger.error(`[ImageService] ❌ R2 upload failed: ${uploadErr.message}`);
        logger.errorEvent('image.generate.report', {
            component: 'ImageService',
            result: 'upload_failed',
            selected_provider: source || null,
            fallback_used: attempts.length > 1,
            attempts,
            upload_error: trimError(uploadErr.message),
            total_duration_ms: Date.now() - startedAt,
            cache_key: cacheKey,
            title_excerpt: (title || '').substring(0, 120),
        });
        return null;
    }
};

const clearImageCache = () => {
    _imageCache.clear();
    logger.info('[ImageService] 🗑️ Cache cleared.');
};

module.exports = { generateAndUploadImage, clearImageCache };
