'use strict';

const authService = require('../services/auth.service');
const ingestionService = require('../services/ingestion.service');
const News = require('../models/News');
const RawNews = require('../models/RawNews');
const Contributor = require('../models/Contributor');
const asyncHandler = require('../utils/asyncHandler');
const { apiResponse } = require('../utils/helpers');
const { AppError } = require('../utils/AppError');

// POST /contributor/login
const login = asyncHandler(async (req, res) => {
    const result = await authService.loginContributor(req.body);
    apiResponse(res, 200, result, 'Contributor login successful');
});

// POST /contributor/register
const register = asyncHandler(async (req, res) => {
    const result = await authService.registerContributor(req.body);
    apiResponse(res, 201, result, 'Registration submitted for approval');
});

// POST /contributor/news
const submitNews = asyncHandler(async (req, res) => {
    const { title, content, sourceUrl, language, district, state } = req.body;

    const { duplicate, id } = await ingestionService.ingestManualEntry({
        title,
        content,
        sourceUrl,
        sourceName: 'Contributor',
        contributorId: req.user.id,
        language,
        location: { district, state: state || 'Andhra Pradesh' },
    });

    if (duplicate) {
        return apiResponse(res, 200, { id }, 'Similar news already submitted');
    }

    // Update contributor stats
    await Contributor.findByIdAndUpdate(req.user.id, {
        $inc: { 'stats.totalSubmissions': 1, 'stats.pending': 1 },
    });

    apiResponse(res, 201, { rawNewsId: id }, 'News submitted for review');
});

// GET /contributor/news
const getMyNews = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { contributorId: req.user.id };
    if (status) filter.processingStatus = status;

    const [rawNews, total] = await Promise.all([
        RawNews.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        RawNews.countDocuments(filter),
    ]);

    apiResponse(res, 200, { news: rawNews, pagination: { total, page, limit } }, 'My submissions');
});

// GET /contributor/profile
const getProfile = asyncHandler(async (req, res) => {
    const contributor = await Contributor.findById(req.user.id).lean();
    if (!contributor) throw new AppError('Contributor not found', 404);
    apiResponse(res, 200, { contributor }, 'Profile fetched');
});

module.exports = { login, register, submitNews, getMyNews, getProfile };
