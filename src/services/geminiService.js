'use strict';

const { GoogleGenAI, Modality } = require('@google/genai');
const { uploadToCloud } = require('../utils/r2');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Gemini client (lazily initialised so .env is loaded before this runs)
// ---------------------------------------------------------------------------
let _aiClient = null;
const getClient = () => {
    if (!_aiClient) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set in environment variables.');
        }
        _aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return _aiClient;
};

// ---------------------------------------------------------------------------
// System-level safety + style instruction for the imagen model
// ---------------------------------------------------------------------------
const IMAGE_SYSTEM_PROMPT = `
Act as a professional editorial illustrator for a high-quality, public-facing news application.
Your goal is to create a clean, symbolic, and professional image based on the news provided.

### CORE INSTRUCTIONS:
- STYLE: Modern digital art, minimalist, and high-contrast. No realistic human faces to avoid uncanny valley or misinformation.
- COMPOSITION: Wide-angle, 16:9 aspect ratio, professional lighting.
- NO TEXT: Do not include any letters, numbers, or watermarks in the image.

### SAFETY & CONTENT RULES:
- STRICT: NO blood, NO weapons, NO gore, NO hateful symbols, and NO physical violence.
- SENSITIVE TOPICS: If the news is about an accident, crime, or tragedy, generate an abstract/symbolic image
  (e.g., a broken chain, a glowing emergency siren, or a somber rainy street) rather than the event itself.

### INPUT DATA:
Title: {{title}}
Summary: {{summary}}
`;

// ---------------------------------------------------------------------------
// In-process cache: parentNewsId (string) -> imageUrl (string)
// Prevents redundant API calls within the same worker run.
// ---------------------------------------------------------------------------
const _imageCache = new Map();

/**
 * Build the final prompt by injecting title & summary into the template.
 * @param {string} title
 * @param {string} summary
 * @returns {string}
 */
const buildPrompt = (title, summary = '') => {
    const safeSummary = summary
        ? summary.substring(0, 500)   // cap to avoid token bloat
        : 'No summary available.';
    return IMAGE_SYSTEM_PROMPT
        .replace('{{title}}', title.substring(0, 250))
        .replace('{{summary}}', safeSummary);
};

/**
 * Generate an editorial image for the given news article and upload it to
 * Cloudflare R2.
 *
 * Deduplication strategy:
 *  1. Check in-memory cache keyed by parentNewsId (covers same run).
 *  2. If cache miss, call Gemini imagen API.
 *  3. Upload raw PNG bytes to R2 and return the public URL.
 *
 * @param {object}  opts
 * @param {string}  opts.title        - News title
 * @param {string}  [opts.summary]    - News summary / body excerpt
 * @param {string}  [opts.parentNewsId] - Used as cache key for deduplication
 * @returns {Promise<string|null>}    - Public image URL or null on failure
 */
const generateAndUploadImage = async ({ title, summary, parentNewsId }) => {
    const cacheKey = parentNewsId ? String(parentNewsId) : null;

    // ── 1. Cache hit ────────────────────────────────────────────────────────
    if (cacheKey && _imageCache.has(cacheKey)) {
        const cachedUrl = _imageCache.get(cacheKey);
        logger.info(`[GeminiService] ♻️  Cache hit for parentNewsId=${cacheKey} → reusing ${cachedUrl}`);
        return cachedUrl;
    }

    // ── 2. Build prompt & call Gemini (with retry on 429) ───────────────────
    const prompt = buildPrompt(title, summary);

    logger.info(`[GeminiService] 🎨 Generating image for: "${title.substring(0, 80)}..."`);

    const MAX_RETRIES = 3;
    const BASE_BACKOFF_MS = 60_000; // 60 s — preview model is ~2 RPM free tier

    let imageBytes;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const ai = getClient();

            const response = await ai.models.generateContent({
                // Confirmed via ListModels API — supports generateContent + Modality.IMAGE
                // Alternatives: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
                model: 'gemini-3.1-flash-image-preview',
                contents: prompt,
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                },
            });

            const parts = response?.candidates?.[0]?.content?.parts ?? [];
            const imagePart = parts.find(
                (p) => p.inlineData && p.inlineData.mimeType?.startsWith('image/')
            );

            if (!imagePart) {
                logger.warn(`[GeminiService] ⚠️  No image in Gemini response for: "${title.substring(0, 80)}"`);
                return null;
            }

            imageBytes = Buffer.from(imagePart.inlineData.data, 'base64');
            break; // success — exit retry loop

        } catch (err) {
            // Detect status from @google/genai v3 error shape
            const httpCode =
                err?.httpErrorCode ??
                err?.code ??
                err?.error?.code ??
                (typeof err?.status === 'number' ? err.status : null);

            const is429 =
                httpCode === 429 ||
                String(err?.status).includes('RESOURCE_EXHAUSTED') ||
                String(err?.message).includes('429') ||
                String(err?.message).includes('RATE_LIMIT');

            const is400 =
                httpCode === 400 ||
                String(err?.status).includes('INVALID_ARGUMENT') ||
                String(err?.message).includes('400');

            if (is400) {
                logger.warn(
                    `[GeminiService] 🚫 Safety/bad-request (400) for: "${title.substring(0, 80)}" — skipping.`
                );
                return null;
            }

            if (is429) {
                const waitMs = BASE_BACKOFF_MS * attempt; // 60s → 120s → 180s
                if (attempt < MAX_RETRIES) {
                    logger.warn(
                        `[GeminiService] ⏳ Rate limit (429) attempt ${attempt}/${MAX_RETRIES} for: "${title.substring(0, 80)}" — waiting ${waitMs / 1000}s...`
                    );
                    await new Promise((r) => setTimeout(r, waitMs));
                } else {
                    logger.warn(
                        `[GeminiService] ⏳ Rate limit (429) — all retries exhausted for: "${title.substring(0, 80)}". Will retry next cron tick.`
                    );
                    return null;
                }
            } else {
                logger.error(`[GeminiService] ❌ Gemini error (attempt ${attempt}): ${err.message}`);
                return null; // non-retryable
            }
        }
    }

    if (!imageBytes) return null;

    // ── 3. Upload to Cloudflare R2 ──────────────────────────────────────────
    try {
        const fileName = `news-${Date.now()}.png`;
        const publicUrl = await uploadToCloud(imageBytes, fileName, 'image/png', 'ai-images');

        logger.info(`[GeminiService] ✅ Image uploaded → ${publicUrl}`);

        if (cacheKey) {
            _imageCache.set(cacheKey, publicUrl);
        }

        return publicUrl;
    } catch (uploadErr) {
        logger.error(`[GeminiService] ❌ R2 upload failed: ${uploadErr.message}`);
        return null;
    }
};

/**
 * Clear the in-process image cache (useful for testing or between scheduled runs).
 */
const clearImageCache = () => {
    _imageCache.clear();
    logger.info('[GeminiService] 🗑️  In-process image cache cleared.');
};

module.exports = { generateAndUploadImage, clearImageCache };
