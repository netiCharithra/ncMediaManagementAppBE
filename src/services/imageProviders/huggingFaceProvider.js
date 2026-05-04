'use strict';
const { HfInference } = require('@huggingface/inference');
const { imageInfo, imageWarn, IMAGE_EVENTS } = require('./imageLogger');

const HF_MODEL = 'black-forest-labs/FLUX.1-schnell';

let _hfClient = null;
const getHFClient = () => {
    if (!_hfClient) {
        const token = process.env.VIVA_DIGITAL_HUGGING_FACE_API_KEY || process.env.VIVA_DIGITAL_HF_TOKEN;
        if (!token) throw new Error('HF_TOKEN not set.');
        _hfClient = new HfInference(token);
    }
    return _hfClient;
};

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

const generateFromHuggingFace = async (title, summary) => {
    const prompt = buildHFPrompt(title, summary);
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

module.exports = { generateFromHuggingFace };
