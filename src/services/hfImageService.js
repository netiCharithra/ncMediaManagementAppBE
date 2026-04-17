'use strict';

/**
 * hfImageService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-provider AI image generation service with automatic fallback.
 * Uses a three-tier strategy to ensure reliability and quality for news photography.
 *
 * Strategy (Primary → Fallback 1 → Fallback 2):
 *   1. Google Gemini  — Primary: High instructions-following, professional style.
 *   2. Hugging Face   — Fallback 1: Cinematic FLUX.1 model, premium quality.
 *   3. Pollinations   — Fallback 2: Free safety net, no API key required.
 *
 * All images are uploaded to Cloudflare R2 and cached in-process to prevent
 * redundant API calls during a single worker run.
 */

const axios = require('axios');
const { HfInference } = require('@huggingface/inference');
const { GoogleGenAI, Modality } = require('@google/genai');
const { uploadToCloud } = require('../utils/r2');
const logger = require('../utils/logger');

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

// ─── Provider Clients ───────────────────────────────────────────────────────

let _hfClient = null;
const getHFClient = () => {
    if (!_hfClient) {
        const token = process.env.HUGGING_FACE_API_KEY || process.env.HF_TOKEN;
        if (!token) throw new Error('HF_TOKEN not set.');
        _hfClient = new HfInference(token);
    }
    return _hfClient;
};

let _geminiClient = null;
const getGeminiClient = () => {
    if (!_geminiClient) {
        const key = process.env.GEMINI_API_KEY;
        if (!key) throw new Error('GEMINI_API_KEY not set.');
        _geminiClient = new GoogleGenAI({ apiKey: key });
    }
    return _geminiClient;
};

// ─── Configuration ──────────────────────────────────────────────────────────

const HF_MODEL = 'black-forest-labs/FLUX.1-schnell';
const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';
const POLLINATIONS_WIDTH = 1024;
const POLLINATIONS_HEIGHT = 768;

// In-process cache: storyKey → R2 imageUrl
const _imageCache = new Map();

// ─── Prompt Engineering ─────────────────────────────────────────────────────

const SCENE_HINTS = {
    election: 'Indian election counting centre, EVM machines, officials in white shirts',
    vote: 'Indian voting booth, ballot box, election officials, rural setting',
    parliament: 'Indian Parliament building exterior, New Delhi, grand architecture',
    minister: 'Government press conference stage, podium with microphones, Indian flags',
    politics: 'Government building, Indian tricolour flag, official signage',
    cricket: 'Cricket stadium aerial view, green pitch, colourful stands',
    ipl: 'IPL cricket stadium at night, floodlights, crowd, colourful team banners',
    football: 'Football stadium, green turf, goal posts, cheering crowd',
    sports: 'Sports stadium, athletic field, championship trophy on podium',
    market: 'Bombay Stock Exchange exterior, Mumbai financial district, traders',
    economy: 'Indian financial district skyline, glass towers, busy street below',
    startup: 'Modern co-working space, laptops, whiteboards, startup office India',
    bank: 'Reserve Bank of India building, stone columns, formal architecture',
    business: 'Corporate boardroom, conference table, city skyline through glass window',
    ai: 'Futuristic server room, blue glowing servers, technology lab',
    tech: 'Modern Indian tech campus, glass buildings, drone shot',
    software: 'Lines of code on screen, developer workspace, multiple monitors',
    satellite: 'ISRO launch pad, rocket on stand, pre-launch scene, India',
    space: 'ISRO mission control room, scientists, large display screens',
    technology: 'Modern robotics lab, circuit boards, holographic displays',
    hospital: 'Modern Indian hospital exterior, emergency entrance, clean corridors',
    vaccine: 'Medical vials and syringes lined up, clinical lab setting',
    health: 'Clean hospital ward, doctors in white coats, medical equipment',
    covid: 'Medical laboratory, test tubes, researchers in protective gear',
    film: 'Bollywood movie set, cameras, director\'s chair, dramatic lighting',
    cinema: 'Indian cinema multiplex exterior with glowing signage at night',
    music: 'Concert stage with colourful lights, empty venue pre-show',
    entertainment: 'Glamorous award ceremony stage with golden trophies, spotlights',
    police: 'Indian police vehicle, officers in uniform, official setting',
    court: 'Indian court building exterior, stone columns, law books',
    crime: 'Empty dark alley at night, police crime scene tape, street lights',
    rain: 'Heavy monsoon rain on Indian city street, reflections in puddles',
    flood: 'Flooded Indian village, submerged roads, relief boats, aerial view',
    cyclone: 'Dramatic storm clouds over coastline, dark sky, turbulent sea',
    weather: 'Dramatic stormy sky over Indian landscape, approaching dark clouds',
    school: 'Indian government school building, colourful classrooms, playground',
    university: 'Indian university campus, grand main building, students walking',
    exam: 'Empty examination hall, rows of desks, answer sheets, invigilators',
    education: 'Modern Indian school library, bookshelves, reading tables',
    train: 'Indian Railways locomotive at station platform, early morning',
    airport: 'Indian international airport terminal, modern architecture',
    road: 'National highway construction, highway overpass, infrastructure India',
    infrastructure: 'Bridge construction over Indian river, cranes, civil engineering site',
    agriculture: 'Lush green Indian farmland, irrigation canals, tractor in field',
    farmer: 'Indian wheat or paddy field at golden hour, agricultural landscape',
    water: 'Indian river dam, hydroelectric power station, blue reservoir',
    temple: 'South Indian temple gopuram, intricate stone carvings, sunrise',
    festival: 'Colourful Indian festival street decorations, lamps, cultural setting',
    heritage: 'Ancient Indian monument, UNESCO heritage site, clear sky',
};

const GEMINI_SYSTEM_PROMPT = `
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

const buildGeminiPrompt = (title, summary = '') => {
    return GEMINI_SYSTEM_PROMPT
        .replace('{{title}}', title.substring(0, 250))
        .replace('{{summary}}', summary.substring(0, 500) || 'No summary available.');
};

const pickSceneHint = (text) => {
    for (const [keyword, scene] of Object.entries(SCENE_HINTS)) {
        // Use whole-word matching to prevent false positives like:
        // 'ai' matching 'Hyundai'/'India', 'market' matching 'supermarket', etc.
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) return scene;
    }
    return '';
};

/** Build documentary style prompt (Pollinations) */
const buildDocumentaryPrompt = (title, summary = '') => {
    const sceneHint = pickSceneHint(`${title} ${summary}`.toLowerCase());
    const subject = title.substring(0, 120).trim();
    return [
        'Realistic news photo',
        sceneHint ? `of ${sceneHint}` : '',
        `subject: ${subject}`,
        'documentary style, photojournalism, natural realistic lighting, high resolution, no text, no watermark, no logos, no people faces'
    ].filter(Boolean).join(', ');
};

/** Build cinematic style prompt (Hugging Face) */
const buildHFPrompt = (title, summary = '') => {
    const safeSummary = summary ? summary.substring(0, 500) : '';
    return [
        'High-resolution professional photo-realistic cinematic photography, mirrorless camera, 8k resolution, ultra-detailed textures.',
        'STRICTLY NO humans, NO people, NO faces, NO human figures.',
        'STRICTLY NO text, NO numbers, NO watermarks.',
        `IMAGE SUBJECT: ${title.substring(0, 250)}.`,
        safeSummary ? `CONTEXT: ${safeSummary}.` : '',
        'Atmospheric and symbolic environment.'
    ].filter(Boolean).join(' ');
};

// ─── Gemini Provider ────────────────────────────────────────────────────────

const generateFromGemini = async (title, summary) => {
    imageInfo('Gemini', IMAGE_EVENTS.REQUESTED, 'Requesting image');
    const prompt = buildGeminiPrompt(title, summary);

    const MAX_RETRIES = 2;
    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            const ai = getGeminiClient();
            const response = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: prompt,
                config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
            });

            const imagePart = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'));
            if (!imagePart) throw new Error('Gemini response missing image.');
            
            return Buffer.from(imagePart.inlineData.data, 'base64');
        } catch (err) {
            const errMsg = err.message || '';
            const isDailyQuotaDead = errMsg.includes('limit: 0');
            const isRateLimit = errMsg.includes('429') || errMsg.includes('EXHAUSTED');

            if (isDailyQuotaDead) {
                // Daily quota exhausted — retrying is pointless, fail immediately
                imageWarn('Gemini', 'Daily quota exhausted (limit: 0). Skipping retry.');
                const wrappedErr = new Error(errMsg);
                wrappedErr.alreadyLogged = true;
                wrappedErr.provider = 'Gemini';
                throw wrappedErr;
            } else if (isRateLimit && i < MAX_RETRIES) {
                imageWarn('Gemini', 'Per-minute rate limit hit. Waiting 30s before retry.');
                await new Promise(r => setTimeout(r, 30000));
            } else {
                const wrappedErr = new Error(errMsg);
                wrappedErr.provider = 'Gemini';
                throw wrappedErr;
            }
        }
    }
};

// ─── Hugging Face Provider ───────────────────────────────────────────────────

const generateFromHuggingFace = async (prompt) => {
    imageInfo('HuggingFace', IMAGE_EVENTS.REQUESTED, 'Requesting image');
    const hf = getHFClient();
    const MAX_RETRIES = 2;
    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            const blob = await hf.textToImage({
                model: HF_MODEL,
                inputs: prompt,
                parameters: { guidance_scale: 3.5 },
            });
            return Buffer.from(await blob.arrayBuffer());
        } catch (err) {
            const isRetryable = err.message?.includes('503') || err.message?.includes('429');
            if (isRetryable && i < MAX_RETRIES) {
                imageWarn('HuggingFace', 'Provider busy (503/429). Waiting 20s before retry.');
                await new Promise(r => setTimeout(r, 20000));
            } else throw err;
        }
    }
};

// ─── Pollinations Provider ──────────────────────────────────────────────────

const generateFromPollinations = async (prompt) => {
    imageInfo('Pollinations', IMAGE_EVENTS.REQUESTED, 'Requesting image');
    const seed = Math.floor(Math.random() * 1000000);
    const url = `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?width=${POLLINATIONS_WIDTH}&height=${POLLINATIONS_HEIGHT}&nologo=true&seed=${seed}`;
    
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    if (!response.data || response.data.byteLength < 2000) throw new Error('Invalid pollinations image.');
    return Buffer.from(response.data);
};

// ─── Public API ─────────────────────────────────────────────────────────────

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
    const order = providerPrio || ['Gemini', 'HuggingFace', 'Pollinations'];

    let imageBuffer = null;
    let source = '';
    const errors = [];
    const attempts = [];

    // Iterate through providers in the specified order
    for (const provider of order) {
        const providerStart = Date.now();
        try {
            if (provider === 'Gemini') {
                imageBuffer = await generateFromGemini(title, summary);
                source = 'Gemini';
            } else if (provider === 'HuggingFace') {
                imageBuffer = await generateFromHuggingFace(buildHFPrompt(title, summary));
                source = 'HuggingFace';
            } else if (provider === 'Pollinations') {
                imageBuffer = await generateFromPollinations(buildDocumentaryPrompt(title, summary));
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
