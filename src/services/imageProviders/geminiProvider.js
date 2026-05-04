'use strict';
const { GoogleGenAI, Modality } = require('@google/genai');
const { imageInfo, imageWarn, IMAGE_EVENTS } = require('./imageLogger');

const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';

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

let _geminiClient = null;
const getGeminiClient = () => {
    if (!_geminiClient) {
        const key = process.env.VIVA_DIGITAL_GEMINI_API_KEY;
        if (!key) throw new Error('GEMINI_API_KEY not set.');
        _geminiClient = new GoogleGenAI({ apiKey: key });
    }
    return _geminiClient;
};

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

module.exports = { generateFromGemini };
