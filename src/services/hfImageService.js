'use strict';

/**
 * hfImageService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates AI images for news articles and uploads them to Cloudflare R2.
 *
 * Strategy (Primary → Fallback):
 *   1. Pollinations.ai  — FREE, no API key, fast (~3-5s). Uses flux model.
 *   2. HuggingFace FLUX.1-schnell — Fallback when Pollinations fails.
 *
 * The public API surface (generateAndUploadImage, clearImageCache) is
 * UNCHANGED so newsWorker.js requires zero edits.
 */

const axios = require('axios');
const { HfInference } = require('@huggingface/inference');
const { uploadToCloud } = require('../utils/r2');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// HuggingFace client — lazily initialised after .env is loaded
// ---------------------------------------------------------------------------
let _hfClient = null;
const getHFClient = () => {
    if (!_hfClient) {
        const token = process.env.HUGGING_FACE_API_KEY || process.env.HF_TOKEN;
        if (!token) {
            throw new Error('HUGGING_FACE_API_KEY (or HF_TOKEN) is not set — HuggingFace fallback unavailable.');
        }
        _hfClient = new HfInference(token);
    }
    return _hfClient;
};

// ---------------------------------------------------------------------------
// Model config
// ---------------------------------------------------------------------------
const HF_MODEL = 'black-forest-labs/FLUX.1-schnell';

// Pollinations endpoint — no API key required (free tier)
// Docs: https://image.pollinations.ai/prompt/{encoded_prompt}
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';
const POLLINATIONS_WIDTH  = 1024;
const POLLINATIONS_HEIGHT = 768;
const POLLINATIONS_MODEL  = 'flux';

// ---------------------------------------------------------------------------
// In-process cache: storyKey → R2 imageUrl
// Prevents redundant API calls within the same worker run.
// ---------------------------------------------------------------------------
const _imageCache = new Map();

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

/**
 * KEYWORD → scene/visual-context map used to enrich the prompt with
 * grounded visual language relevant to Indian news.
 */
const SCENE_HINTS = {
    election:      'Indian election counting centre, EVM machines, officials in white shirts',
    vote:          'Indian voting booth, ballot box, election officials, rural setting',
    parliament:    'Indian Parliament building exterior, New Delhi, grand architecture',
    minister:      'Government press conference stage, podium with microphones, Indian flags',
    politics:      'Government building, Indian tricolour flag, official signage',

    cricket:       'Cricket stadium aerial view, green pitch, colourful stands',
    ipl:           'IPL cricket stadium at night, floodlights, crowd, colourful team banners',
    football:      'Football stadium, green turf, goal posts, cheering crowd',
    sports:        'Sports stadium, athletic field, championship trophy on podium',

    market:        'Bombay Stock Exchange exterior, Mumbai financial district, traders',
    economy:       'Indian financial district skyline, glass towers, busy street below',
    startup:       'Modern co-working space, laptops, whiteboards, startup office India',
    bank:          'Reserve Bank of India building, stone columns, formal architecture',
    business:      'Corporate boardroom, conference table, city skyline through glass window',

    ai:            'Futuristic server room, blue glowing servers, technology lab',
    tech:          'Modern Indian tech campus, glass buildings, drone shot',
    software:      'Lines of code on screen, developer workspace, multiple monitors',
    satellite:     'ISRO launch pad, rocket on stand, pre-launch scene, India',
    space:         'ISRO mission control room, scientists, large display screens',
    technology:    'Modern robotics lab, circuit boards, holographic displays',

    hospital:      'Modern Indian hospital exterior, emergency entrance, clean corridors',
    vaccine:       'Medical vials and syringes lined up, clinical lab setting',
    health:        'Clean hospital ward, doctors in white coats, medical equipment',
    covid:         'Medical laboratory, test tubes, researchers in protective gear',

    film:          'Bollywood movie set, cameras, director\'s chair, dramatic lighting',
    cinema:        'Indian cinema multiplex exterior with glowing signage at night',
    music:         'Concert stage with colourful lights, empty venue pre-show',
    entertainment: 'Glamorous award ceremony stage with golden trophies, spotlights',

    police:        'Indian police vehicle, officers in uniform, official setting',
    court:         'Indian court building exterior, stone columns, law books',
    crime:         'Empty dark alley at night, police crime scene tape, street lights',

    rain:          'Heavy monsoon rain on Indian city street, reflections in puddles',
    flood:         'Flooded Indian village, submerged roads, relief boats, aerial view',
    cyclone:       'Dramatic storm clouds over coastline, dark sky, turbulent sea',
    weather:       'Dramatic stormy sky over Indian landscape, approaching dark clouds',

    school:        'Indian government school building, colourful classrooms, playground',
    university:    'Indian university campus, grand main building, students walking',
    exam:          'Empty examination hall, rows of desks, answer sheets, invigilators',
    education:     'Modern Indian school library, bookshelves, reading tables',

    train:         'Indian Railways locomotive at station platform, early morning',
    airport:       'Indian international airport terminal, modern architecture',
    road:          'National highway construction, highway overpass, infrastructure India',
    infrastructure:'Bridge construction over Indian river, cranes, civil engineering site',

    agriculture:   'Lush green Indian farmland, irrigation canals, tractor in field',
    farmer:        'Indian wheat or paddy field at golden hour, agricultural landscape',
    water:         'Indian river dam, hydroelectric power station, blue reservoir',

    temple:        'South Indian temple gopuram, intricate stone carvings, sunrise',
    festival:      'Colourful Indian festival street decorations, lamps, cultural setting',
    heritage:      'Ancient Indian monument, UNESCO heritage site, clear sky',
};

/**
 * Pick a visual scene hint from the article text by matching SCENE_HINTS keys.
 * @param {string} text - Combined title + summary (lowercased)
 * @returns {string} - Matched scene string or empty string
 */
const pickSceneHint = (text) => {
    for (const [keyword, scene] of Object.entries(SCENE_HINTS)) {
        if (text.includes(keyword)) return scene;
    }
    return '';
};

/**
 * Build an editorial, documentary-style prompt for Pollinations.ai.
 * Concise, keyword-driven, news-photo style.
 * Example: "Realistic news photo, of Indian election counting centre, EVM machines,
 *           documentary style, photojournalism, natural realistic lighting, no text"
 *
 * @param {string} title
 * @param {string} [summary]
 * @returns {string}
 */
const buildPrompt = (title, summary = '') => {
    const lowerText = `${title} ${summary}`.toLowerCase();
    const sceneHint = pickSceneHint(lowerText);

    // Core subject: distill from title (first 120 chars keeps the prompt focused)
    const coreSubject = title.substring(0, 120).trim();

    // Compose parts
    const parts = [
        'Realistic news photo',
        sceneHint ? `of ${sceneHint}` : `related to: ${coreSubject}`,
        'documentary style',
        'photojournalism',
        'natural realistic lighting',
        'high resolution',
        'no text',
        'no watermark',
        'no logos',
        'no people faces',
    ];

    return parts.join(', ');
};

/**
 * Build the original cinematic/detailed prompt for HuggingFace FLUX.
 * Uses the full title + summary for richest detail.
 * Kept exactly as the original HF prompt style — do not change.
 *
 * @param {string} title
 * @param {string} [summary]
 * @returns {string}
 */
const buildHFPrompt = (title, summary = '') => {
    const safeSummary = summary ? summary.substring(0, 500) : '';

    return [
        'High-resolution professional photo-realistic cinematic photography, shot with mirrorless camera, 8k resolution, ultra-detailed textures.',
        'STRICTLY NO humans, NO people, NO persons, NO faces, NO crowds, NO human figures, NO silhouettes.',
        'STRICTLY NO text, NO letters, NO numbers, NO captions, NO words, NO signage, NO watermarks.',
        'Focus on ARCHITECTURE, NATURE, VEHICLES, BUILDINGS, TECHNOLOGY, or SYMBOLIC OBJECTS related to the news topic.',
        `IMAGE SUBJECT: ${title.substring(0, 250)}.`,
        safeSummary ? `DETAILED CONTEXT: ${safeSummary}.` : '',
        'Ensure the composition captures the environment and atmosphere of the news topic without any human presence.',
    ]
        .filter(Boolean)
        .join(' ');
};

// ---------------------------------------------------------------------------
// Primary: Pollinations.ai  (FREE — no API key)
// ---------------------------------------------------------------------------

/**
 * Generate an image buffer using Pollinations.ai free API.
 * Returns a raw Buffer (PNG/JPEG binary).
 * @param {string} prompt
 * @returns {Promise<Buffer>}
 */
const generateFromPollinations = async (prompt) => {
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `${POLLINATIONS_BASE}/${encodedPrompt}?width=${POLLINATIONS_WIDTH}&height=${POLLINATIONS_HEIGHT}&model=${POLLINATIONS_MODEL}&nologo=true`;

    logger.info(`[ImageService] 🌸 Pollinations: requesting image...`);

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60_000, // 60s — Pollinations can be slow on first hit
        headers: {
            'User-Agent': 'VivaDigitalNews/1.0 NewsImageBot',
        },
    });

    if (!response.data || response.data.byteLength < 1000) {
        throw new Error(`Pollinations returned suspiciously small response: ${response.data?.byteLength} bytes`);
    }

    logger.info(`[ImageService] 🌸 Pollinations: received ${response.data.byteLength} bytes`);
    return Buffer.from(response.data);
};

// ---------------------------------------------------------------------------
// Fallback: HuggingFace FLUX.1-schnell
// ---------------------------------------------------------------------------

/**
 * Generate an image buffer using HuggingFace FLUX.1-schnell.
 * Returns a raw Buffer.
 * @param {string} prompt
 * @returns {Promise<Buffer>}
 */
const generateFromHuggingFace = async (prompt) => {
    logger.info(`[ImageService] 🤗 HuggingFace FLUX: requesting image (fallback)...`);

    const hf = getHFClient();

    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const imageBlob = await hf.textToImage({
                model: HF_MODEL,
                inputs: prompt,
                parameters: {
                    guidance_scale: 3.5,
                },
            });

            const buffer = Buffer.from(await imageBlob.arrayBuffer());
            logger.info(`[ImageService] 🤗 HuggingFace: received ${buffer.length} bytes`);
            return buffer;

        } catch (err) {
            const msg = err.message || '';

            // 503 = model cold start — retry with increasing back-off
            if (msg.includes('503') || msg.toLowerCase().includes('loading')) {
                const waitMs = 30_000 * attempt;
                if (attempt < MAX_RETRIES) {
                    logger.warn(`[ImageService] 🤗 HuggingFace: 503 model loading (attempt ${attempt}/${MAX_RETRIES}) — waiting ${waitMs / 1000}s...`);
                    await new Promise((r) => setTimeout(r, waitMs));
                } else {
                    throw new Error(`HuggingFace model still loading after ${MAX_RETRIES} attempts`);
                }

            } else if (msg.includes('429') || msg.toLowerCase().includes('rate')) {
                const waitMs = 60_000 * attempt;
                if (attempt < MAX_RETRIES) {
                    logger.warn(`[ImageService] 🤗 HuggingFace: 429 rate limit (attempt ${attempt}/${MAX_RETRIES}) — waiting ${waitMs / 1000}s...`);
                    await new Promise((r) => setTimeout(r, waitMs));
                } else {
                    throw new Error('HuggingFace rate limit — all retries exhausted');
                }

            } else {
                // Non-retryable — throw immediately so the caller knows
                throw err;
            }
        }
    }

    throw new Error('HuggingFace: max retries reached without a result');
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an editorial image for a news story and upload it to Cloudflare R2.
 *
 * Flow:
 *   1. Check in-process cache (skips API calls entirely for the same story).
 *   2. Build a smart, documentary-style prompt.
 *   3. Try Pollinations.ai (PRIMARY — free, no key).
 *   4. On any failure → try HuggingFace FLUX.1-schnell (FALLBACK).
 *   5. Upload the resulting buffer to R2, cache the URL, and return it.
 *
 * @param {object}  opts
 * @param {string}  opts.title          - News headline
 * @param {string}  [opts.summary]      - News summary / body excerpt
 * @param {string}  [opts.parentNewsId] - Used as in-process dedup cache key
 * @returns {Promise<string|null>}      - Public R2 URL or null on total failure
 */
const generateAndUploadImage = async ({ title, summary, parentNewsId }) => {
    const cacheKey = parentNewsId ? String(parentNewsId) : null;

    // ── 1. In-process cache hit ─────────────────────────────────────────────
    if (cacheKey && _imageCache.has(cacheKey)) {
        const cached = _imageCache.get(cacheKey);
        logger.info(`[ImageService] ♻️  Cache hit for storyKey=${cacheKey} → ${cached}`);
        return { imageUrl: cached, source: 'cache' };
    }

    // ── 2. Build prompts — each provider uses its own tuned style ──────────
    const pollinationsPrompt = buildPrompt(title, summary);    // short, documentary-style
    const hfPrompt           = buildHFPrompt(title, summary);  // cinematic, detailed (original HF style)
    logger.info(`[ImageService] 🎨 Pollinations prompt: "${pollinationsPrompt}"`);
    logger.info(`[ImageService] 📰 Story: "${(title || '').substring(0, 80)}"`);

    // ── 3. Primary: Pollinations → Fallback: HuggingFace ───────────────────
    let imageBuffer = null;
    let source = '';

    try {
        imageBuffer = await generateFromPollinations(pollinationsPrompt);
        source = 'Pollinations';
    } catch (pollinationErr) {
        logger.warn(`[ImageService] 🌸 Pollinations failed: ${pollinationErr.message} — switching to HuggingFace fallback...`);
        try {
            imageBuffer = await generateFromHuggingFace(hfPrompt); // uses original cinematic HF prompt
            source = 'HuggingFace';
        } catch (hfErr) {
            logger.error(`[ImageService] ❌ Both providers failed. Pollinations: ${pollinationErr.message} | HuggingFace: ${hfErr.message}`);
            return null;
        }
    }

    if (!imageBuffer) return null;

    // ── 4. Upload to Cloudflare R2 ──────────────────────────────────────────
    try {
        const fileName = `news-${Date.now()}.png`;
        const publicUrl = await uploadToCloud(imageBuffer, fileName, 'image/png', 'ai-images');

        logger.info(`[ImageService] ✅ [${source}] Image uploaded → ${publicUrl}`);

        if (cacheKey) {
            _imageCache.set(cacheKey, publicUrl);
        }

        return { imageUrl: publicUrl, source };
    } catch (uploadErr) {
        logger.error(`[ImageService] ❌ R2 upload failed: ${uploadErr.message}`);
        return null;
    }
};

/**
 * Clear the in-process image cache between scheduled runs.
 * Called by newsWorker.js at the start of each cron tick.
 */
const clearImageCache = () => {
    _imageCache.clear();
    logger.info('[ImageService] 🗑️  In-process image cache cleared.');
};

module.exports = { generateAndUploadImage, clearImageCache };
