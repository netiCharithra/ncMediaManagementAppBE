'use strict';

const { HfInference } = require('@huggingface/inference');
const { uploadToCloud } = require('../utils/r2');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// HuggingFace client — lazily initialised after .env is loaded
// ---------------------------------------------------------------------------
let _hfClient = null;
const getClient = () => {
    if (!_hfClient) {
        const token = process.env.HUGGING_FACE_API_KEY || process.env.HF_TOKEN;
        if (!token) {
            throw new Error('HUGGING_FACE_API_KEY (or HF_TOKEN) is not set in environment variables.');
        }
        _hfClient = new HfInference(token);
    }
    return _hfClient;
};

// ---------------------------------------------------------------------------
// Model config
// ---------------------------------------------------------------------------
const HF_MODEL = 'black-forest-labs/FLUX.1-schnell';

// ---------------------------------------------------------------------------
// In-process cache: storyKey (string) → imageUrl (string)
// Prevents redundant API calls within the same worker run.
// ---------------------------------------------------------------------------
const _imageCache = new Map();

/**
 * Build an editorial image prompt from the news title + summary.
 * @param {string} title
 * @param {string} [summary]
 * @returns {string}
 */
const buildPrompt = (title, summary = '') => {
    const safeSummary = summary ? summary.substring(0, 500) : '';

    return [
        'High-resolution professional photo-realistic cinematic photography, shot with mirrorless camera, 8k resolution, ultra-detailed textures.',
        'STRICTLY NO humans, NO people, NO persons, NO faces, NO crowds, NO human figures, NO silhouettes.',
        'STRICTLY NO text, NO letters, NO numbers, NO captions, NO words, NO signage, NO watermarks.',
        'Focus on ARCHITECTURE, NATURE, VEHICLES, BUILDINGS, TECHNOLOGY, or SYMBOLIC OBJECTS related to the news topic.',
        `IMAGE SUBJECT: ${title.substring(0, 250)}.`,
        safeSummary ? `DETAILED CONTEXT: ${safeSummary}.` : '',
        'Ensure the composition captures the environment and atmosphere of the news topic without any human presence.'
    ]
        .filter(Boolean)
        .join(' ');
};

/**
 * Generate an editorial image for a news story using FLUX.1-schnell on
 * Hugging Face Inference API, then upload the result to Cloudflare R2.
 *
 * Deduplication: if the same storyKey (parentNewsId / articleId) is requested
 * twice within a run, the cached R2 URL is returned without an API call.
 *
 * @param {object}  opts
 * @param {string}  opts.title         - News headline
 * @param {string}  [opts.summary]     - News summary / body excerpt
 * @param {string}  [opts.parentNewsId] - Used as cache key
 * @returns {Promise<string|null>}      - Public R2 URL or null on failure
 */
const generateAndUploadImage = async ({ title, summary, parentNewsId }) => {
    const cacheKey = parentNewsId ? String(parentNewsId) : null;

    // ── 1. In-process cache hit ─────────────────────────────────────────────
    if (cacheKey && _imageCache.has(cacheKey)) {
        const cached = _imageCache.get(cacheKey);
        logger.info(`[HFImageService] ♻️  Cache hit for storyKey=${cacheKey} → ${cached}`);
        return cached;
    }

    // ── 2. Build prompt & call FLUX ─────────────────────────────────────────
    const prompt = buildPrompt(title, summary);
    logger.info(`[HFImageService] 🎨 Generating image for: "${title.substring(0, 80)}..."`);

    const MAX_RETRIES = 3;
    let imageBlob = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const hf = getClient();

            imageBlob = await hf.textToImage({
                model: HF_MODEL,
                inputs: prompt,
                parameters: {
                    guidance_scale: 3.5,
                },
            });

            break; // success — exit retry loop

        } catch (err) {
            const msg = err.message || '';

            // 503 = model is warming up (cold start) — retry after a pause
            if (msg.includes('503') || msg.toLowerCase().includes('loading')) {
                const waitMs = 30_000 * attempt; // 30s, 60s, 90s
                if (attempt < MAX_RETRIES) {
                    logger.warn(
                        `[HFImageService] ⏳ Model loading (503) attempt ${attempt}/${MAX_RETRIES} — waiting ${waitMs / 1000}s...`
                    );
                    await new Promise((r) => setTimeout(r, waitMs));
                } else {
                    logger.warn(
                        `[HFImageService] ⏳ Model still loading after ${MAX_RETRIES} attempts — will retry next cron tick.`
                    );
                    return null;
                }
            } else if (msg.includes('429') || msg.toLowerCase().includes('rate')) {
                const waitMs = 60_000 * attempt; // 60s, 120s, 180s
                if (attempt < MAX_RETRIES) {
                    logger.warn(
                        `[HFImageService] ⏳ Rate limit (429) attempt ${attempt}/${MAX_RETRIES} — waiting ${waitMs / 1000}s...`
                    );
                    await new Promise((r) => setTimeout(r, waitMs));
                } else {
                    logger.warn(`[HFImageService] ⏳ Rate limit — all retries exhausted. Will retry next cron tick.`);
                    return null;
                }
            } else {
                // Non-retryable error
                logger.error(`[HFImageService] ❌ HF API error (attempt ${attempt}): ${msg}`);
                return null;
            }
        }
    }

    if (!imageBlob) return null;

    // ── 3. Blob → Buffer ────────────────────────────────────────────────────
    let imageBuffer;
    try {
        imageBuffer = Buffer.from(await imageBlob.arrayBuffer());
    } catch (convErr) {
        logger.error(`[HFImageService] ❌ Failed to convert Blob to Buffer: ${convErr.message}`);
        return null;
    }

    // ── 4. Upload to Cloudflare R2 ──────────────────────────────────────────
    try {
        const fileName = `news-${Date.now()}.png`;
        const publicUrl = await uploadToCloud(imageBuffer, fileName, 'image/png', 'ai-images');

        logger.info(`[HFImageService] ✅ Image uploaded → ${publicUrl}`);

        if (cacheKey) {
            _imageCache.set(cacheKey, publicUrl);
        }

        return publicUrl;
    } catch (uploadErr) {
        logger.error(`[HFImageService] ❌ R2 upload failed: ${uploadErr.message}`);
        return null;
    }
};

/**
 * Clear the in-process image cache between scheduled runs.
 */
const clearImageCache = () => {
    _imageCache.clear();
    logger.info('[HFImageService] 🗑️  In-process image cache cleared.');
};

module.exports = { generateAndUploadImage, clearImageCache };
