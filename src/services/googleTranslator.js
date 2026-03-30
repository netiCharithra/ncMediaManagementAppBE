'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Translate an array of strings or a single string using Google Cloud Translation API.
 */
const translateText = async (text, targetLang) => {
    if (!text) return text;
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.TRANSLATION_API_KEY;

    if (!apiKey || apiKey === 'your_translation_api_key') {
        logger.warn('Google Translate API Key not set. Returning original text.');
        return text;
    }

    try {
        const isArray = Array.isArray(text);
        const q = isArray ? text : [text];

        const response = await axios.post(
            `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
            {
                q,
                target: targetLang,
                format: 'text'
            }
        );

        const translations = response.data.data.translations.map(t => t.translatedText);
        return isArray ? translations : translations[0];
    } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.message;
        logger.error(`Google Translation to ${targetLang} failed: ${errorMsg}`);
        return text;
    }
};

/**
 * Translate a news article using Google Cloud Translate (optimally in one call).
 */
const translateArticle = async (article, targetLang) => {
    const { title, summary, content } = article;
    const textsToTranslate = [title, summary, content];

    const translatedTexts = await translateText(textsToTranslate, targetLang);

    return {
        title: translatedTexts[0],
        summary: translatedTexts[1],
        content: translatedTexts[2]
    };
};

module.exports = { translateText, translateArticle };
