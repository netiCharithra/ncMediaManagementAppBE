'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 8000; // Start with 8s, doubles on each retry

/**
 * Make a single Groq API call for summarization.
 */
const callGroqAPI = async (title, content) => {
    return axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content:
                        `You are a professional News Editor. Your task is to process news articles for a mobile app feed.

Instructions:
1. Create a CONCISE TITLE: Strictly MAX 10 words. Must fit in 2 lines on a mobile screen.
2. Create a MOBILE-OPTIMIZED SUMMARY: MAX 4-5 sentences. Must fit on a single mobile screen.
3. NO REPETITION: Do NOT repeat the title in the summary. Start directly with the story.
4. LANGUAGE: Respond in the SAME LANGUAGE as the input article.
5. Maintain absolute factual accuracy.
6. Output ONLY valid JSON with keys "title" and "summary".`,
                },
                { role: 'user', content: `Original Title: ${title}\n\nOriginal Content: ${content}` },
            ],
            max_tokens: 400, // Reduced to stay under TPM limits
            temperature: 0.5,
            response_format: { type: 'json_object' },
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 20000,
        }
    );
};

/**
 * Summarize the content of a raw news article using Groq AI (Llama 3.1).
 * Returns an object { title, summary }.
 * Retries up to MAX_RETRIES times on rate limit (429) errors with exponential backoff.
 */
const summarizeNews = async (title, content) => {
    if (!process.env.GROQ_API_KEY) {
        logger.warn('GROQ_API_KEY not set. Using fallback summarization.');
        return {
            title: title.substring(0, 60),
            summary: content.substring(0, 300).trim() + (content.length > 300 ? '...' : ''),
        };
    }

    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await callGroqAPI(title, content);

            let result;
            try {
                result = JSON.parse(response.data.choices[0].message.content.trim());
            } catch (parseErr) {
                // Robust: extract JSON block if there's surrounding noise
                const rawContent = response.data.choices[0].message.content;
                const match = rawContent.match(/\{[\s\S]*\}/);
                if (match) {
                    result = JSON.parse(match[0]);
                } else {
                    throw new Error('Invalid JSON response from AI');
                }
            }

            return {
                title: result.title || title,
                summary: result.summary || content.substring(0, 300),
            };

        } catch (err) {
            lastError = err;
            const status = err.response?.status;

            // Rate limit hit — wait and retry
            if (status === 429) {
                // Use Retry-After header if provided by Groq, else use exponential backoff
                const retryAfterHeader = err.response?.headers?.['retry-after'];
                const waitMs = retryAfterHeader
                    ? parseInt(retryAfterHeader, 10) * 1000
                    : BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);

                logger.warn(
                    `[Groq] Rate limit hit (attempt ${attempt}/${MAX_RETRIES}). Waiting ${waitMs / 1000}s before retry...`
                );
                await new Promise((resolve) => setTimeout(resolve, waitMs));
                continue; // retry
            }

            // Non-retryable error — break immediately
            logger.warn(`[Groq] Summarization failed (non-retryable): ${err.message}`);
            break;
        }
    }

    // All retries exhausted or non-retryable error — use fallback
    logger.warn(`[Groq] Summarization falling back after error: ${lastError?.message}`);
    return {
        title: title.substring(0, 60),
        summary: content.substring(0, 300).trim() + (content.length > 300 ? '...' : ''),
    };
};

module.exports = { summarizeNews };
