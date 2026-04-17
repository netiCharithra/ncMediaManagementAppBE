'use strict';

const RSSParser = require('rss-parser');
const RawNews = require('../models/RawNews');
const { generateContentHash } = require('../utils/helpers');
const logger = require('../utils/logger');

const parser = new RSSParser({
    timeout: 10000,
    headers: { 'User-Agent': 'VivaDigitalNews/1.0 RSS Ingestion Bot' },
});

/**
 * Ingest news from all configured RSS feeds.
 * Returns { ingested, skipped, errors } summary.
 */
const ingestRSSFeeds = async () => {
    const RSS_FEEDS = (process.env.VIVA_DIGITAL_RSS_FEED_URLS || '').split(',').filter(Boolean);
    const summary = { ingested: 0, skipped: 0, errors: 0 };
    logger.info(`[RSS Ingestion] Starting... Found ${RSS_FEEDS.length} feed URLs configured.`);

    for (const feedUrl of RSS_FEEDS) {
        try {
            const trimmedUrl = feedUrl.trim();
            logger.info(`[RSS] ⏳ Fetching: ${trimmedUrl}`);
            
            const startTime = Date.now();
            const feed = await parser.parseURL(trimmedUrl);
            logger.info(`[RSS] ✅ Fetched [${feed.title || trimmedUrl}] in ${Date.now() - startTime}ms. Items found: ${feed.items?.length || 0}`);
            
            let feedIngested = 0;
            let feedSkipped = 0;

            // Basic language detection based on source URL
            let detectedLanguage = '-na-';
            const urlLower = trimmedUrl.toLowerCase();
            if (urlLower.includes('ndtv') || urlLower.includes('thehindu') || urlLower.includes('indianexpress') || urlLower.includes('timesofindia')) {
                detectedLanguage = 'en';
            } else if (urlLower.includes('sakshi') || urlLower.includes('eenadu') || urlLower.includes('andhrajyothy')) {
                detectedLanguage = 'te';
            }

            for (const item of feed.items) {
                const title = (item.title || '').trim();
                const content = (item.contentSnippet || item.content || item.summary || '').trim();

                if (!title || !content) {
                    summary.skipped++;
                    feedSkipped++;
                    continue;
                }

                // ─── Filter: Only process news from the last 48 hours ─────────────────
                const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
                const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
                
                if (pubDate < fortyEightHoursAgo) {
                    // logger.debug(`[RSS] ⏭️ Skipping old article: "${title.substring(0, 50)}..." (${pubDate.toDateString()})`);
                    summary.skipped++;
                    feedSkipped++;
                    continue;
                }

                const contentHash = generateContentHash(title, content);

                // Idempotent upsert based on hash
                const existing = await RawNews.findOne({ contentHash });
                if (existing) {
                    summary.skipped++;
                    feedSkipped++;
                    continue;
                }

                await RawNews.create({
                    title,
                    content,
                    sourceUrl: item.link || trimmedUrl,
                    sourceName: feed.title || new URL(trimmedUrl).hostname,
                    sourceType: 'rss',
                    language: detectedLanguage,
                    publishedAt: pubDate,
                    imageUrl: item.enclosure?.url || null,
                    contentHash,
                    processingStatus: 'pending',
                });

                summary.ingested++;
                feedIngested++;
                logger.info(`[RSS] 📥 Downloaded: "${title.substring(0, 80)}..."`);
            }
            logger.info(`[RSS] 📊 Stats for [${feed.title || trimmedUrl}]: Inserted ${feedIngested} new, Skipped/Dup ${feedSkipped}`);
        } catch (err) {
            logger.error(`[RSS] ❌ Failed to ingest ${feedUrl}:`, err.message);
            summary.errors++;
        }
    }

    logger.info(`[RSS Ingestion] 🎉 Complete! Total New: ${summary.ingested}, Total Skipped (Dup): ${summary.skipped}, Errors: ${summary.errors}`);
    return summary;
};

/**
 * Ingest a single manual editorial entry (from admin/contributor).
 */
const ingestManualEntry = async ({ title, content, sourceUrl, sourceName, contributorId, language, location }) => {
    const contentHash = generateContentHash(title, content);

    const existing = await RawNews.findOne({ contentHash });
    if (existing) {
        return { duplicate: true, id: existing._id };
    }

    const rawNews = await RawNews.create({
        title,
        content,
        sourceUrl,
        sourceName,
        sourceType: contributorId ? 'contributor' : 'editorial',
        language: language || '-na-',
        contentHash,
        contributorId: contributorId || null,
        location,
        processingStatus: 'pending',
    });

    return { duplicate: false, id: rawNews._id };
};

module.exports = { ingestRSSFeeds, ingestManualEntry };
