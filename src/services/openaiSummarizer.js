'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Summarize the content of a raw news article using OpenAI API.
 * Falls back to first 200 chars if API unavailable.
 */
const summarizeNews = async (title, content) => {
    if (!process.env.OPENAI_API_KEY) {
        logger.warn('OPENAI_API_KEY not set. Using fallback summarization.');
        return content.substring(0, 200).trim() + (content.length > 200 ? '...' : '');
    }

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a news editor. Summarize the following news article in 2-3 concise sentences. Output only the summary.',
                    },
                    { role: 'user', content: `Title: ${title}\n\nContent: ${content}` },
                ],
                max_tokens: 150,
                temperature: 0.3,
            },
            {
                headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                timeout: 15000,
            }
        );

        return response.data.choices[0].message.content.trim();
    } catch (err) {
        logger.warn('OpenAI summarization failed, using fallback:', err.message);
        return content.substring(0, 200).trim() + '...';
    }
};

module.exports = { summarizeNews };
