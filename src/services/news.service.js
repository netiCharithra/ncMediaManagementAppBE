'use strict';

const mongoose = require('mongoose');
const News = require('../models/News');
const Category = require('../models/Category');
const NewsTranslation = require('../models/NewsTranslation');
const { AppError } = require('../utils/AppError');
const { paginate } = require('../utils/helpers');
const { clearCachePattern } = require('../utils/cache');
const { uploadToCloud } = require('../utils/r2');

// ─── Hyperlocal Feed ───────────────────────────────────────────────────────────

/**
 * Fetch a prioritised hyperlocal news feed.
 * Priority: district > state > national > international
 */
const getHyperlocalFeed = async ({ district, state = 'Andhra Pradesh', page = 1, limit = 20, language } = {}) => {
    const { skip, limit: lim, page: pg } = paginate(page, limit);

    const baseFilter = { status: 'published' };
    if (language) baseFilter.originalLanguage = language;

    // Build priority buckets — sort by createdAt so articles without publishedAt still order correctly
    const districtQ = district
        ? News.find({ ...baseFilter, 'location.district': district })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('category', 'name nameInTelugu slug icon color')
            .lean()
        : Promise.resolve([]);

    // If no district is specified, include all district news within that state in the state bucket
    const stateFilter = { ...baseFilter, 'location.state': state };
    if (district) {
        stateFilter['location.scope'] = 'state';
    } else {
        stateFilter['location.scope'] = { $in: ['state', 'district'] };
    }

    const stateQ = News.find(stateFilter)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('category', 'name nameInTelugu slug icon color')
        .lean();

    const nationalQ = News.find({ ...baseFilter, 'location.scope': 'national' })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('category', 'name nameInTelugu slug icon color')
        .lean();

    const intlQ = News.find({ ...baseFilter, 'location.scope': 'international' })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('category', 'name nameInTelugu slug icon color')
        .lean();

    const [districtNews, stateNews, nationalNews, intlNews] = await Promise.all([
        districtQ,
        stateQ,
        nationalQ,
        intlQ,
    ]);

    // Merge with priority weighting, deduplicate by id
    const seen = new Set();
    const merged = [...districtNews, ...stateNews, ...nationalNews, ...intlNews].filter((n) => {
        const id = n._id.toString();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });

    // Sort merged result: use publishedAt if available, fall back to createdAt (latest first)
    merged.sort((a, b) => {
        const dateB = new Date(b.publishedAt || b.createdAt);
        const dateA = new Date(a.publishedAt || a.createdAt);
        return dateB - dateA;
    });

    // Manual pagination on merged result
    const total = merged.length;
    let paginated = merged.slice(skip, skip + lim);

    // Transform category for language-specific display
    paginated = paginated.map((item) => {
        if (item.category) {
            item.category.displayName =
                language === 'te' ? item.category.nameInTelugu || item.category.name : item.category.name;
        }
        return item;
    });

    return {
        news: paginated,
        pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
    };
};

// ─── Single Article ────────────────────────────────────────────────────────────

const getNewsById = async (id) => {
    const news = await News.findById(id)
        .populate('category', 'name slug color')
        .populate('author', 'name')
        .lean();

    if (!news || news.status !== 'published') {
        throw new AppError('News article not found', 404);
    }

    // Increment view count (fire-and-forget)
    News.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

    return news;
};

const getNewsByIdForAdmin = async (id) => {
    const news = await News.findById(id)
        .populate('category', 'name slug color')
        .populate('author', 'name')
        .lean();

    if (!news) {
        throw new AppError('News article not found', 404);
    }

    return news;
};

// ─── By Category ───────────────────────────────────────────────────────────────

const getNewsByCategory = async (categorySlug, { page = 1, limit = 20 } = {}) => {
    const { skip, limit: lim, page: pg } = paginate(page, limit);

    const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
    if (!category) throw new AppError('Category not found', 404);

    const filter = { status: 'published', category: category._id };
    const [news, total] = await Promise.all([
        News.find(filter)
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(lim)
            .populate('category', 'name slug color')
            .lean(),
        News.countDocuments(filter),
    ]);

    return {
        category,
        news,
        pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
    };
};

// ─── Trending ──────────────────────────────────────────────────────────────────

const getTrendingNews = async ({ limit = 10 } = {}) => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    return News.find({ status: 'published', publishedAt: { $gte: cutoff } })
        .sort({ views: -1, shares: -1 })
        .limit(Math.min(50, parseInt(limit)))
        .populate('category', 'name slug')
        .lean();
};

// ─── Search ────────────────────────────────────────────────────────────────────

const searchNews = async ({ q, district, state, categorySlug, page = 1, limit = 20 } = {}) => {
    if (!q || q.trim().length < 2) throw new AppError('Search query must be at least 2 characters', 400);

    const { skip, limit: lim, page: pg } = paginate(page, limit);
    const filter = { status: 'published', $text: { $search: q } };

    if (district) filter['location.district'] = district;
    if (state) filter['location.state'] = state;
    if (categorySlug) {
        const cat = await Category.findOne({ slug: categorySlug }).lean();
        if (cat) filter.category = cat._id;
    }

    const [news, total] = await Promise.all([
        News.find(filter, { score: { $meta: 'textScore' } })
            .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
            .skip(skip)
            .limit(lim)
            .populate('category', 'name slug')
            .lean(),
        News.countDocuments(filter),
    ]);

    return {
        query: q,
        news,
        pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) },
    };
};

// ─── Admin CRUD ────────────────────────────────────────────────────────────────

const createNews = async (data, adminId, file = null) => {
    // Pre-generate ID to use in folder naming
    const newsId = new mongoose.Types.ObjectId();
    const newsData = { ...data, _id: newsId };

    // Handle image upload if exists
    if (file) {
        const folder = `news/${newsId.toString()}`;
        newsData.imageUrl = await uploadToCloud(file.buffer, file.originalname, file.mimetype, folder);
    }

    // Map flat form data for location and language if it comes from multipart
    if (data.location_district || data.location_state || data.location_scope || data.language) {
        let scope = data.location_scope || (data.location && data.location.scope) || 'national';
        if (scope === 'local') scope = 'district'; // Alias local to district for model compatibility

        newsData.location = {
            district: data.location_district || (data.location && data.location.district),
            state: data.location_state || (data.location && data.location.state) || 'Andhra Pradesh',
            scope: scope,
        };

        // Handle language mapping
        newsData.originalLanguage = data.originalLanguage || data.language || 'te';

        // Clean up the flat fields so they don't get saved twice
        delete newsData.location_district;
        delete newsData.location_state;
        delete newsData.location_scope;
        delete newsData.language;
    } else if (!newsData.originalLanguage) {
        newsData.originalLanguage = 'te'; // Default to Telugu for new articles
    }

    const news = await News.create({ ...newsData, author: adminId, authorModel: 'Admin' });

    // If this news was created from a RawNews entry, mark the raw entry as processed
    if (data.rawNewsId) {
        const RawNews = require('../models/RawNews');
        await RawNews.findByIdAndUpdate(data.rawNewsId, {
            processingStatus: 'processed',
            processedNewsId: news._id,
        });
    }

    await clearCachePattern('news:*');
    return news;
};

const updateNews = async (id, data, adminId, file = null) => {
    const news = await News.findById(id);
    if (!news) throw new AppError('News article not found', 404);

    // ── Image handling ───────────────────────────────────────────────────────
    // Priority 1: a new file was uploaded — upload to R2 and replace the URL
    // Priority 2: an imageUrl string was explicitly sent — use it as-is
    // Priority 3: neither — keep the existing imageUrl untouched
    if (file) {
        const folder = `news/${news._id.toString()}`;
        const uploadedUrl = await uploadToCloud(file.buffer, file.originalname, file.mimetype, folder);
        news.imageUrl = uploadedUrl;
        news.markModified('imageUrl');
        // Remove from data so the loop below doesn't overwrite what we just set
        delete data.imageUrl;
    } else if (data.imageUrl) {
        news.imageUrl = data.imageUrl;
        news.markModified('imageUrl');
        delete data.imageUrl;
    }
    // else: imageUrl not in data and no file — Mongoose leaves existing value untouched

    // ── Location & Language mapping ──────────────────────────────────────────
    if (data.location_district || data.location_state || data.location_scope || data.language) {
        let scope = data.location_scope || data.location?.scope || news.location?.scope || 'national';
        if (scope === 'local') scope = 'district';

        data.location = {
            district: data.location_district || data.location?.district || news.location?.district,
            state: data.location_state || data.location?.state || news.location?.state || 'Andhra Pradesh',
            scope: scope,
        };
        if (data.language) data.originalLanguage = data.language;

        // Clean up flat fields
        delete data.location_district;
        delete data.location_state;
        delete data.location_scope;
        delete data.language;
    }

    // ── Apply remaining scalar/nested updates ────────────────────────────────
    Object.keys(data).forEach((key) => {
        news[key] = data[key];
    });

    news.reviewedBy = adminId;

    await news.save();
    await clearCachePattern('news:*');
    return news;
};

const deleteNews = async (id) => {
    const news = await News.findByIdAndUpdate(id, { status: 'archived' }, { new: true });
    if (!news) throw new AppError('News article not found', 404);
    await clearCachePattern('news:*');
    return { message: 'News archived successfully' };
};

const listNewsForAdmin = async ({ q, status, language, page = 1, limit = 20 } = {}) => {
    const skip = (page - 1) * limit;
    const filter = {};

    if (status && status !== 'all') filter.status = status;

    if (language) {
        const translatedIds = await NewsTranslation.distinct('newsId', { language });
        filter.$or = [{ originalLanguage: language }, { _id: { $in: translatedIds } }];
    }

    if (q) {
        const searchFilter = {
            $or: [
                { title: { $regex: q, $options: 'i' } },
                { slug: { $regex: q, $options: 'i' } },
            ],
        };

        if (filter.$or) {
            // Need to wrap both in $and to avoid overriding the language $or
            const langFilter = { $or: filter.$or };
            delete filter.$or;
            filter.$and = [langFilter, searchFilter];
        } else {
            filter.$or = searchFilter.$or;
        }
    }

    const [news, total] = await Promise.all([
        News.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('category', 'name slug')
            .populate('author', 'name')
            .lean(),
        News.countDocuments(filter),
    ]);

    // If a language filter is applied, merge translation content where available
    const processedNews = await Promise.all(
        news.map(async (item) => {
            // If the item is already in the requested language, no need to swap
            if (language && item.originalLanguage !== language) {
                const translation = await NewsTranslation.findOne({ newsId: item._id, language }).lean();
                if (translation) {
                    return {
                        ...item,
                        title: translation.title,
                        summary: translation.summary,
                        content: translation.content,
                        displayLanguage: language,
                        isTranslation: true,
                    };
                }
            }
            return {
                ...item,
                displayLanguage: item.originalLanguage,
                isTranslation: false,
            };
        })
    );

    return {
        news: processedNews,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    };
};

const Language = require('../models/Language');

const getBootstrapConfig = async () => {
    const [languages, categories] = await Promise.all([
        Language.find({ isActive: true }).sort({ order: 1, name: 1 }).lean(),
        Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean(),
    ]);
    return { languages, categories };
};

module.exports = {
    getHyperlocalFeed,
    getNewsById,
    getNewsByCategory,
    getTrendingNews,
    searchNews,
    createNews,
    updateNews,
    deleteNews,
    listNewsForAdmin,
    getNewsByIdForAdmin,
    getBootstrapConfig,
};
