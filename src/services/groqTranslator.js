'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Translate a news article (title, summary, content) using a single Groq AI call.
 */
const translateArticle = async (article, targetLang) => {
    if (!article.title && !article.summary && !article.content) return article;
    if (!process.env.GROQ_API_KEY) {
        logger.warn('GROQ_API_KEY not set. Returning original text.');
        return article;
    }

    const langMap = { 'te': 'Telugu', 'hi': 'Hindi', 'en': 'English' };
    const targetLangName = langMap[targetLang] || targetLang;

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
        try {
            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a professional news translator. Your task is to translate a news object into ${targetLangName}.
                            
                            Instructions:
                            1. Translate the "title", "summary", and "content" fields.
                            2. Maintain a formal, journalistic tone.
                            3. You MUST respond with a valid JSON object.
                            4. The JSON object must have exactly three keys: "title", "summary", and "content".
                            5. Do not include any text before or after the JSON object.`
                        },
                        {
                            role: 'user',
                            content: `Translate this news article into ${targetLangName} and return as JSON:\n\n${JSON.stringify({
                                title: article.title,
                                summary: article.summary,
                                content: article.content
                            })}`
                        },
                    ],
                    response_format: { type: "json_object" },
                    max_tokens: 4000,
                    temperature: 0.1,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000, // Increase timeout for long articles
                }
            );

            const translated = JSON.parse(response.data.choices[0].message.content);
            return {
                title: translated.title || article.title,
                summary: translated.summary || article.summary,
                content: translated.content || article.content
            };
        } catch (err) {
            const isRateLimit = err.response?.status === 429;
            const errorMsg = err.response?.data?.error?.message || err.message;

            if (isRateLimit && retries < maxRetries - 1) {
                const waitTime = (retries + 1) * 5000; // Wait 5s, 10s...
                logger.warn(`Groq rate limit hit. Waiting ${waitTime / 1000}s before retry ${retries + 1}...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                retries++;
                continue;
            }

            logger.warn(`Groq multi-translation to ${targetLang} failed: ${errorMsg}`);
            return article; // Fallback to original
        }
    }
};

/**
 * Legacy support for single text translation
 */
const translateText = async (text, targetLang) => {
    const result = await translateArticle({ title: text }, targetLang);
    return result.title;
};

module.exports = { translateArticle, translateText };
