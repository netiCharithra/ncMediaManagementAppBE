'use strict';
const axios = require('axios');
const ColabSession = require('../../models/ColabSession');
const { imageInfo, IMAGE_EVENTS } = require('./imageLogger');

const buildColabPrompt = (title, summary = '') => {
    const safeSummary = summary ? summary.substring(0, 500) : '';
    return `Act as a professional editorial illustrator. Create a clean, symbolic, and professional image based on the news provided.
STYLE: High-resolution professional photo-realistic cinematic photography, mirrorless camera, 8k resolution.
COMPOSITION: Wide-angle, professional lighting.
STRICTLY NO humans, NO people, NO faces, NO human figures (to avoid misinformation).
STRICTLY NO text, NO numbers, NO words, NO watermarks.
IMAGE SUBJECT: ${title.substring(0, 250)}.
CONTEXT: ${safeSummary}.
Atmospheric and symbolic environment.`;
};

const generateFromColab = async (title, summary) => {
    imageInfo('ColabNgrok', IMAGE_EVENTS.REQUESTED, 'Requesting image from Colab');
    
    // Fetch active ngrok endpoint from MongoDB
    const session = await ColabSession.findOne({ keepAliveKey: 'singleton' }).lean();
    if (!session || !session.url) {
        throw new Error('No active Colab Ngrok URL found in database.');
    }

    const colabEndpoint = `${session.url.replace(/\/$/, '')}/generate-image`;
    const prompt = buildColabPrompt(title, summary);

    const response = await axios.post(
        colabEndpoint,
        { prompt },
        { 
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            timeout: 60000 * 5 // Image generation might take up to a minute
        }
    );

    let base64Data = response.data;

    // Handle common JSON payload structures if it's not a plain string
    if (typeof base64Data === 'object') {
        base64Data = base64Data.image || base64Data.image_base64 || base64Data.base64 || base64Data.data;
    }

    if (!base64Data || typeof base64Data !== 'string') {
        throw new Error('Invalid or missing base64 image data returned from Colab');
    }

    // Strip out the data URI scheme if present (e.g., "data:image/png;base64,")
    if (base64Data.includes('base64,')) {
        base64Data = base64Data.split('base64,')[1];
    }

    return Buffer.from(base64Data, 'base64');
};

module.exports = { generateFromColab };
