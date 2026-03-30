'use strict';

const axios = require('axios');
const RawNews = require('../models/RawNews');
const News = require('../models/News');
const NewsTranslation = require('../models/NewsTranslation');
const Category = require('../models/Category');
const logger = require('../utils/logger');

// Import summarization and translation services
const { summarizeNews } = require('./groqSummarizer');
const { translateArticle } = require('./googleTranslator');
// const { translateText } = require('./groqTranslator'); // Available but unused
// const { summarizeNews } = require('./openaiSummarizer'); // Available but unused

// ─── Summarization ─────────────────────────────────────────────────────────────


/**
 * Summarize the content of a raw news article using OpenAI API.
 * Falls back to first 200 chars if API unavailable.
 * @deprecated Moved to openaiSummarizer.js
 */
/*
const summarizeContent = async (title, content) => {
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
*/

// ─── Categorization ────────────────────────────────────────────────────────────

const KEYWORD_CATEGORY_MAP = {
    politics: ['election', 'minister', 'parliament', 'government', 'party', 'vote', 'politician', 'cm', 'pm'],
    sports: ['cricket', 'football', 'ipl', 'match', 'tournament', 'player', 'team', 'score', 'goal'],
    business: ['stock', 'market', 'economy', 'finance', 'trade', 'gdp', 'bank', 'startup', 'company'],
    technology: ['tech', 'app', 'software', 'ai', 'robot', 'digital', 'internet', 'cybersecurity', 'gadget'],
    health: ['health', 'hospital', 'doctor', 'disease', 'vaccine', 'medicine', 'covid', 'treatment'],
    entertainment: ['film', 'movie', 'actor', 'actress', 'music', 'celebrity', 'tollywood', 'bollywood'],
    crime: ['arrested', 'police', 'murder', 'theft', 'fraud', 'robbery', 'crime', 'court'],
    weather: ['rain', 'flood', 'cyclone', 'drought', 'monsoon', 'storm', 'weather', 'temperature'],
    education: ['school', 'college', 'university', 'exam', 'student', 'education', 'eamcet', 'results'],
};

const categorizeContent = async (title, content) => {
    const text = `${title} ${content}`.toLowerCase();
    const scores = {};

    for (const [cat, keywords] of Object.entries(KEYWORD_CATEGORY_MAP)) {
        scores[cat] = keywords.filter((kw) => text.includes(kw)).length;
    }

    const bestMatch = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
    const categoryName = bestMatch && bestMatch[1] > 0 ? bestMatch[0] : 'general';

    // Find or create category in DB
    let category = await Category.findOne({ slug: categoryName });
    if (!category) {
        category = await Category.create({ name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1) });
    }

    return category._id;
};

// ─── Translation ───────────────────────────────────────────────────────────────

const translateContent = async (newsId, title, summary, content, targetLanguages = ['te'], extraData = {}) => {
    const results = [];

    // Use Promise.all to translate into all target languages simultaneously (Parallel Batch Pattern)
    await Promise.all(
        targetLanguages.map(async (lang) => {
            try {
                const translated = await translateArticle({ title, summary, content }, lang);

                const translation = await NewsTranslation.findOneAndUpdate(
                    { newsId, language: lang },
                    {
                        title: translated.title,
                        summary: translated.summary,
                        content: translated.content,
                        imageUrl: extraData.imageUrl || null,
                        sourceUrl: extraData.sourceUrl || null,
                        sourceName: extraData.sourceName || null,
                        sourceType: extraData.sourceType || null,
                        translationSource: 'api',
                    },
                    { upsert: true, new: true }
                );

                results.push(translation);
            } catch (err) {
                logger.error(`Translation to ${lang} failed for news ${newsId}:`, err.message);
            }
        })
    );

    return results;
};
// ─── Location Tagging ──────────────────────────────────────────────────────────

const AP_DISTRICTS = [
    'anantapur', 'chittoor', 'east godavari', 'guntur', 'kadapa', 'krishna',
    'kurnool', 'nellore', 'prakasam', 'srikakulam', 'visakhapatnam',
    'vizianagaram', 'west godavari', 'palnadu', 'bapatla', 'manyam agency',
];

const tagLocation = (title, content) => {
    const text = `${title} ${content}`.toLowerCase();

    for (const district of AP_DISTRICTS) {
        if (text.includes(district)) {
            return { scope: 'district', district, state: 'Andhra Pradesh', country: 'India' };
        }
    }

    if (text.includes('andhra') || text.includes('telangana') || text.includes('ap ')) {
        return { scope: 'state', state: 'Andhra Pradesh', country: 'India' };
    }

    const intlKeywords = ['usa', 'china', 'uk', 'europe', 'global', 'world', 'international'];
    if (intlKeywords.some((kw) => text.includes(kw))) {
        return { scope: 'international', country: 'International' };
    }

    return { scope: 'national', state: '', country: 'India' };
};

// ─── Pipeline Orchestrator ────────────────────────────────────────────────────

/**
 * Runs the full processing pipeline on a single RawNews document:
 * Deduplicate → Summarize → Categorize → Location Tag → Publish (as draft)
 */
const processPipeline = async (rawNews) => {
    if (rawNews.processingStatus !== 'pending') return null;

    try {
        await RawNews.findByIdAndUpdate(rawNews._id, { processingStatus: 'processing' });

        // Summarize (Now returns { title, summary })
        const { title: summarizedTitle, summary } = await summarizeNews(rawNews.title, rawNews.content);

        // Categorize
        const categoryId = await categorizeContent(summarizedTitle, rawNews.content);

        // Location tag
        const location = tagLocation(summarizedTitle, rawNews.content);

        // Find default admin author
        const Admin = require('../models/Admin');
        const defaultAdmin = await Admin.findOne({ role: { $in: ['admin', 'super_admin'] } }).lean();

        // Create News document (draft state for editorial review)
        const news = await News.create({
            title: summarizedTitle,
            summary,
            content: summary, // Use summarized version as the main content
            imageUrl: rawNews.imageUrl,
            sourceUrl: rawNews.sourceUrl,
            sourceName: rawNews.sourceName,
            sourceType: rawNews.sourceType,
            originalLanguage: rawNews.language,
            rawNewsId: rawNews._id,
            category: categoryId,
            location,
            status: 'review',
            author: defaultAdmin?._id || null,
            authorModel: 'Admin',
            publishedAt: rawNews.publishedAt,
        });

        // Translate to Telugu (Disabled per user request)
        // await translateContent(news._id, news.title, news.summary, news.content, ['te'], { imageUrl: news.imageUrl, sourceUrl: news.sourceUrl, sourceName: news.sourceName, sourceType: news.sourceType });

        // Mark raw as processed
        await RawNews.findByIdAndUpdate(rawNews._id, {
            processingStatus: 'processed',
            processedNewsId: news._id,
        });

        logger.info(`Pipeline: Processed raw news ${rawNews._id} → news ${news._id}`);
        return news;
    } catch (err) {
        await RawNews.findByIdAndUpdate(rawNews._id, {
            processingStatus: 'failed',
            processingError: err.message,
            $inc: { retryCount: 1 },
        });
        logger.error(`Pipeline failed for raw news ${rawNews._id}:`, err.message);
        throw err;
    }
};

module.exports = { summarizeNews, summarizeContent: summarizeNews, categorizeContent, translateContent, tagLocation, processPipeline };
