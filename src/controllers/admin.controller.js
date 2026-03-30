'use strict';

const mongoose = require('mongoose');
const authService = require('../services/auth.service');
const newsService = require('../services/news.service');
const notificationService = require('../services/notification.service');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Contributor = require('../models/Contributor');
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
                authorModel: news.authorModel,
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
                            authorModel: article.authorModel,
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

    const existing = await Admin.findOne({ email });
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

    const editor = await Admin.create({
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
    const editors = await Admin.find({ role: 'editor' })
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
    const editor = await Admin.findOneAndUpdate(
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
        User.countDocuments({ isActive: true }),
        Contributor.countDocuments({ status: 'approved' }),
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
        Contributor.find({ status }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Contributor.countDocuments({ status }),
    ]);
    apiResponse(res, 200, { contributors, pagination: { total, page, limit } }, 'Contributors fetched');
});

// PUT /admin/contributors/:id/approve
const approveContributor = asyncHandler(async (req, res) => {
    const contributor = await Contributor.findByIdAndUpdate(
        req.params.id,
        { status: 'approved' },
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
};
