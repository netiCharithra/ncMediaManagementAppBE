'use strict';

const mongoose = require('mongoose');
const authService = require('../services/auth.service');
const newsService = require('../services/news.service');
const notificationService = require('../services/notification.service');
const User = require('../models/User');
const RawNews = require('../models/RawNews');
const News = require('../models/News');
const NewsTranslation = require('../models/NewsTranslation');
const asyncHandler = require('../utils/asyncHandler');
const { apiResponse } = require('../utils/helpers');
const { AppError } = require('../utils/AppError');
const bcrypt = require('bcryptjs');

// POST /admin/login
const login = asyncHandler(async (req, res) => {
    const result = await authService.loginAdmin(req.body);
    apiResponse(res, 200, result, 'Admin login successful');
});

// POST /admin/news
const createNews = asyncHandler(async (req, res) => {
    const news = await newsService.createNews(req.body, req.user.id, req.file);
    apiResponse(res, 201, { news }, 'News created successfully');
});

// PUT /admin/news/:id
const updateNews = asyncHandler(async (req, res) => {
    const news = await newsService.updateNews(req.params.id, req.body, req.user.id, req.file);
    apiResponse(res, 200, { news }, 'News updated successfully');
});

// DELETE /admin/news/:id
const deleteNews = asyncHandler(async (req, res) => {
    const result = await newsService.deleteNews(req.params.id);
    apiResponse(res, 200, result, 'News archived successfully');
});

// PUT /admin/news/:id/publish
const publishNews = asyncHandler(async (req, res) => {
    const news = await newsService.updateNews(
        req.params.id,
        { status: 'published', isBreaking: req.body.isBreaking || false },
        req.user.id
    );

    // ─── Promote Translations to Main News Collection ──────────────────────────
    const translations = await NewsTranslation.find({ newsId: req.params.id });

    for (const trans of translations) {
        // Check if this translation has already been promoted to avoid duplicates
        const existing = await News.findOne({
            rawNewsId: news.rawNewsId,
            originalLanguage: trans.language,
        });

        if (!existing) {
            await News.create({
                title: trans.title,
                summary: trans.summary,
                content: trans.content,
                imageUrl: trans.imageUrl || news.imageUrl,
                sourceUrl: trans.sourceUrl || news.sourceUrl,
                sourceName: trans.sourceName || news.sourceName,
                sourceType: trans.sourceType || news.sourceType,
                originalLanguage: trans.language,
                parentNewsId: news._id,
                translationSource: trans.translationSource === 'api' ? 'automatic' : 'manual',
                category: news.category,
                location: news.location,
                status: 'published',
                author: news.author,
                publishedAt: news.publishedAt || new Date(),
                rawNewsId: news.rawNewsId,
                tags: news.tags,
            });
        } else {
            // If it already exists in News, just make sure it's published and updated
            await News.findByIdAndUpdate(existing._id, {
                title: trans.title,
                summary: trans.summary,
                content: trans.content,
                parentNewsId: news._id,
                translationSource: trans.translationSource === 'api' ? 'automatic' : 'manual',
                status: 'published',
                publishedAt: news.publishedAt || new Date(),
            });
        }
    }

    // Clean up translations now that they are in the main News collection
    await NewsTranslation.deleteMany({ newsId: req.params.id });

    // Trigger breaking news notification if flagged
    if (req.body.isBreaking) {
        await notificationService.sendNotification({
            title: `🔴 Breaking: ${news.title}`,
            body: news.summary || news.title,
            type: 'breaking',
            newsId: news._id,
            targetAudience: 'all',
            sentBy: req.user.id,
        });
    }

    apiResponse(res, 200, { news }, 'News published');
});

// POST /admin/notification
const sendNotification = asyncHandler(async (req, res) => {
    const result = await notificationService.sendNotification({ ...req.body, sentBy: req.user.id });
    apiResponse(res, 200, result, 'Notification sent');
});

// PUT /admin/news/bulk-publish
// Bulk-approves all news in 'review' status (optionally filtered by language).
// Only accessible to roles with 'bulkPublish' permission (or super_admin).
const bulkPublishNews = asyncHandler(async (req, res) => {
    const { language, ids } = req.body;

    console.log("ids", ids)
    // Either publish specific IDs or all pending-review articles
    let filter = { status: 'review' };
    if (ids && Array.isArray(ids) && ids.length > 0) {
        // Ensure all IDs are valid ObjectIds
        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
        if (validIds.length === 0) {
            throw new AppError('Invalid value for field: ids', 400);
        }
        filter._id = { $in: validIds };
    } else if (language) {
        filter.originalLanguage = language;
    }

    const articles = await News.find(filter); // Don't use .lean() to keep Mongoose IDs and relationship helpers
    if (!articles.length) {
        return apiResponse(res, 200, { published: 0 }, 'No articles in review found to publish');
    }

    let published = 0;
    let failed = 0;
    const errors = [];

    for (const article of articles) {
        try {
            const now = new Date();
            const isAdmin = req.user.role === 'super_admin';
            const threshold = isAdmin ? 1 : 2;

            // Add current approval if not already there
            if (!article.approvals.includes(req.user.id)) {
                article.approvals.push(req.user.id);
            }

            // Only publish translations & change status if threshold met
            const isFullyApproved = article.approvals.length >= threshold;

            if (isFullyApproved) {
                // Promotion logic is only for articles that have translations
                const translations = await NewsTranslation.find({ newsId: article._id });
                for (const trans of translations) {
                    // If this is a translation, we check if it already exists in main News
                    const existing = trans.rawNewsId
                        ? await News.findOne({ rawNewsId: trans.rawNewsId, originalLanguage: trans.language })
                        : await News.findOne({ parentNewsId: article._id, originalLanguage: trans.language });

                    if (!existing) {
                        await News.create({
                            title: trans.title,
                            summary: trans.summary,
                            content: trans.content,
                            imageUrl: trans.imageUrl || article.imageUrl,
                            sourceUrl: trans.sourceUrl || article.sourceUrl,
                            sourceName: trans.sourceName || article.sourceName,
                            sourceType: trans.sourceType || article.sourceType,
                            originalLanguage: trans.language,
                            parentNewsId: article._id,
                            translationSource: trans.translationSource === 'api' ? 'automatic' : 'manual',
                            category: article.category,
                            location: article.location,
                            status: 'published',
                            author: article.author,
                            publishedAt: now,
                            rawNewsId: article.rawNewsId,
                            tags: article.tags || [],
                        });
                    } else {
                        await News.findByIdAndUpdate(existing._id, {
                            $set: {
                                title: trans.title,
                                summary: trans.summary,
                                content: trans.content,
                                status: 'published',
                                publishedAt: now,
                            },
                        });
                    }
                }

                // Cleanup translations
                if (translations.length > 0) {
                    await NewsTranslation.deleteMany({ newsId: article._id });
                }

                // Publish the article itself
                article.status = 'published';
                article.reviewedBy = req.user.id;
                article.publishedAt = now;
            }

            await article.save();
            published++;
        } catch (err) {
            failed++;
            errors.push({ id: article._id, error: err.message });
        }
    }

    apiResponse(
        res,
        200,
        { published, failed, errors: errors.length ? errors : undefined },
        `Bulk publish complete: ${published} published, ${failed} failed`
    );
});

// POST /admin/editors — Only super_admin can create editor accounts
const createEditorAccount = asyncHandler(async (req, res) => {
    const { name, email, password, permissions } = req.body;

    if (!name || !email || !password) {
        throw new AppError('name, email, and password are required', 400);
    }

    const existing = await User.findOne({ email });
    if (existing) throw new AppError('An account with this email already exists', 409);

    // Editor defaults: can view news, approve individually, bulk publish, view analytics
    const editorPermissions = {
        manageNews: true,
        approveNews: true,
        bulkPublish: true,
        manageUsers: false,
        manageContributors: false,
        sendNotifications: false,
        viewAnalytics: true,
        // Allow caller to override specific permissions
        ...(permissions || {}),
    };

    const editor = await User.create({
        name,
        email,
        password,
        role: 'editor',
        permissions: editorPermissions,
    });

    apiResponse(
        res,
        201,
        { editor: { _id: editor._id, name: editor.name, email: editor.email, role: editor.role, permissions: editor.permissions } },
        'Editor account created successfully'
    );
});

// GET /admin/editors — List all editor accounts (super_admin only)
const listEditors = asyncHandler(async (req, res) => {
    const editors = await User.find({ role: 'editor' })
        .select('-password -refreshToken')
        .sort({ createdAt: -1 })
        .lean();
    apiResponse(res, 200, { editors }, 'Editor list fetched');
});

// PATCH /admin/editors/:id/permissions — Update editor permissions
const updateEditorPermissions = asyncHandler(async (req, res) => {
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
        throw new AppError('permissions object is required', 400);
    }
    const editor = await User.findOneAndUpdate(
        { _id: req.params.id, role: 'editor' },
        { $set: { permissions } },
        { new: true, select: '-password -refreshToken' }
    );
    if (!editor) throw new AppError('Editor not found', 404);
    apiResponse(res, 200, { editor }, 'Editor permissions updated');
});

// GET /admin/dashboard/stats
const getDashboardStats = asyncHandler(async (req, res) => {
    const { language, timeRange } = req.query;

    // ─── Time Range Filtering ──────────────────────────────────────────────────
    let dateFilter = {};
    if (timeRange && timeRange !== 'all') {
        const now = new Date();
        let startDate = new Date();

        switch (timeRange) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                dateFilter = { createdAt: { $gte: startDate } };
                break;
            case 'yesterday':
                const yesterdayStart = new Date();
                yesterdayStart.setDate(yesterdayStart.getDate() - 1);
                yesterdayStart.setHours(0, 0, 0, 0);
                const yesterdayEnd = new Date(yesterdayStart);
                yesterdayEnd.setHours(23, 59, 59, 999);
                dateFilter = { createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } };
                break;
            case 'last7days':
                startDate.setDate(startDate.getDate() - 7);
                dateFilter = { createdAt: { $gte: startDate } };
                break;
            case 'last30days':
                startDate.setDate(startDate.getDate() - 30);
                dateFilter = { createdAt: { $gte: startDate } };
                break;
        }
    }

    // ─── Language Filtering ─────────────────────────────────────────────────────
    let newsFilter = { ...dateFilter };
    if (language) {
        const translatedIds = await NewsTranslation.distinct('newsId', { language });
        const langQuery = {
            $or: [{ originalLanguage: language }, { _id: { $in: translatedIds } }],
        };

        if (Object.keys(dateFilter).length > 0) {
            newsFilter = { $and: [langQuery, dateFilter] };
        } else {
            newsFilter = langQuery;
        }
    }

    const rawFilter = { ...dateFilter };
    if (language) rawFilter.language = language;

    const [totalNews, publishedNews, pendingReview, totalUsers, totalContributors, rawPending] = await Promise.all([
        News.countDocuments(newsFilter),
        News.countDocuments({ ...newsFilter, status: 'published' }),
        News.countDocuments({ ...newsFilter, status: 'review' }),
        User.countDocuments({ role: 'user', isActive: true }),
        User.countDocuments({ role: 'contributor', contributorStatus: 'approved' }),
        RawNews.countDocuments({ ...rawFilter, processingStatus: 'pending' }),
    ]);

    const recentNews = await News.find(newsFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title status createdAt originalLanguage')
        .lean();

    apiResponse(
        res,
        200,
        {
            languageSelect: language || 'all',
            timeRange: timeRange || 'all',
            stats: { totalNews, publishedNews, pendingReview, totalUsers, totalContributors, rawPending },
            recentNews,
        },
        'Dashboard stats fetched'
    );
});

// GET /admin/contributors
const listContributors = asyncHandler(async (req, res) => {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const [contributors, total] = await Promise.all([
        User.find({ role: 'contributor', contributorStatus: status }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        User.countDocuments({ role: 'contributor', contributorStatus: status }),
    ]);
    apiResponse(res, 200, { contributors, pagination: { total, page, limit } }, 'Contributors fetched');
});

// PUT /admin/contributors/:id/approve
const approveContributor = asyncHandler(async (req, res) => {
    const contributor = await User.findOneAndUpdate(
        { _id: req.params.id, role: 'contributor' },
        { contributorStatus: 'approved' },
        { new: true }
    );
    if (!contributor) throw new AppError('Contributor not found', 404);
    apiResponse(res, 200, { contributor }, 'Contributor approved');
});

// GET /admin/raw-news
const listRawNews = asyncHandler(async (req, res) => {
    const { status = 'pending', page = 1, limit = 20, language } = req.query;
    const skip = (page - 1) * limit;

    const filter = { processingStatus: status };
    if (language) filter.language = language;

    const [rawNews, total] = await Promise.all([
        RawNews.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        RawNews.countDocuments(filter),
    ]);
    apiResponse(res, 200, { rawNews, pagination: { total, page, limit } }, 'Raw news list');
});

// GET /admin/news
const listNews = asyncHandler(async (req, res) => {
    const result = await newsService.listNewsForAdmin(req.query);
    apiResponse(res, 200, result, 'News list fetched');
});

// GET /admin/news/:id
const getNewsDetail = asyncHandler(async (req, res) => {
    const news = await newsService.getNewsByIdForAdmin(req.params.id);
    apiResponse(res, 200, { news }, 'News detail fetched');
});

// GET /admin/scheduler/status
const getSchedulerStatus = (req, res) => {
    try {
        const cronParser = require('cron-parser');
        
        const jobs = [
            { name: 'Master Sequential Pipeline', pattern: '*/10 * * * *', desc: 'RSS -> Sum -> Trans -> Img' },
            { name: 'Catch-up (Sum + Trans)', pattern: '*/5 * * * *', desc: 'Processes pending raw news' },
            { name: 'Image Safety Net', pattern: '*/5 * * * *', desc: 'Syncs missed images to R2' },
            { name: 'Trending Recalc', pattern: '0 * * * *', desc: 'Hourly views refresh' },
            { name: 'Daily EOD Summary', pattern: '59 23 * * *', desc: 'IST Performance audit' }
        ];

        const schedule = jobs.map(job => {
            try {
                // Use .default.parse for version 5.x
                const parser = cronParser.default || cronParser;
                const interval = parser.parse(job.pattern, { tz: 'Asia/Kolkata' });
                const next = interval.next();
                const nextDate = next.toDate();
                return {
                    ...job,
                    nextRun: nextDate,
                    countdown: Math.floor((nextDate.getTime() - Date.now()) / 1000 / 60) // minutes
                };
            } catch (pErr) {
                return { ...job, nextRun: new Date(), countdown: 0, error: true };
            }
        });

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="refresh" content="30">
            <title>VIVA | Pipeline Monitor</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --primary: #38bdf8; --accent: #4ade80; }
                body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); padding: 4%; margin: 0; }
                .container { max-width: 1000px; margin: 0 auto; }
                .glass { background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); backdrop-filter: blur(12px); }
                h1 { margin: 0; font-weight: 700; color: var(--primary); letter-spacing: -0.025em; }
                .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px; }
                .tagline { color: #94a3b8; font-size: 16px; margin-top: 8px; }
                .status-badge { display: flex; align-items: center; gap: 8px; color: var(--accent); font-weight: 600; font-size: 13px; text-transform: uppercase; }
                .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: flicker 2s infinite; }
                @keyframes flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                table { width: 100%; border-collapse: separate; border-spacing: 0 8px; margin-top: 10px; }
                th { text-align: left; padding: 12px 16px; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; }
                tr.row { transition: 0.3s; }
                tr.row:hover { background: rgba(255,255,255,0.05); }
                td { padding: 20px 16px; background: rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); }
                td:first-child { border-left: 1px solid rgba(255,255,255,0.05); border-radius: 12px 0 0 12px; }
                td:last-child { border-right: 1px solid rgba(255,255,255,0.05); border-radius: 0 12px 12px 0; }
                .job-name { font-weight: 600; font-size: 15px; }
                .cron-pill { background: #0369a1; padding: 4px 10px; border-radius: 100px; font-size: 11px; font-family: monospace; }
                .highlight { color: #fca5a5; font-weight: 700; }
                .footer { margin-top: 30px; text-align: center; color: #475569; font-size: 12px; font-weight: 500; }
                .btn { display: inline-block; padding: 10px 20px; background: var(--primary); color: #000; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 13px; margin-top: 20px; transition: 0.2s; }
                .btn:hover { filter: brightness(1.2); transform: translateY(-2px); }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="glass">
                    <div class="header">
                        <div>
                            <h1>Pipeline Monitor</h1>
                            <div class="tagline">LIVE: Real-time Ingestion & Service Schedule</div>
                        </div>
                        <div class="status-badge"><div class="dot"></div> System Live</div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Task Description</th>
                                <th>Schedule</th>
                                <th>Responsibility</th>
                                <th>Next Run (Est. In)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${schedule.map(s => `
                                <tr class="row">
                                    <td><div class="job-name">${s.name}</div></td>
                                    <td><span class="cron-pill">${s.pattern}</span></td>
                                    <td style="color: #cbd5e1; font-size: 13px;">${s.desc}</td>
                                    <td>
                                        <div class="highlight">${s.nextRun.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                                        <div style="font-size: 10px; color: #64748b; margin-top:4px;">In ~${s.countdown} minutes</div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div style="text-align: right;">
                        <a href="#" onclick="window.location.reload()" class="btn">REFRESH DATA</a>
                    </div>
                </div>
                <div class="footer">
                    Vishwa Vani Digital News © 2026 | Service Account: ${new Date().toLocaleDateString('en-IN')}
                </div>
            </div>
        </body>
        </html>
        `;
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    login,
    createNews,
    updateNews,
    deleteNews,
    publishNews,
    bulkPublishNews,
    sendNotification,
    getDashboardStats,
    listContributors,
    approveContributor,
    listRawNews,
    listNews,
    getNewsDetail,
    createEditorAccount,
    listEditors,
    updateEditorPermissions,
    getSchedulerStatus,
};
