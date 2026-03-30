'use strict';

const newsService = require('../services/news.service');
const asyncHandler = require('../utils/asyncHandler');
const { apiResponse } = require('../utils/helpers');

// GET /api/news/feed
const getFeed = asyncHandler(async (req, res) => {
    const { district, state, page, limit, language } = req.query;
    const result = await newsService.getHyperlocalFeed({ district, state, page, limit, language });
    apiResponse(res, 200, result, 'Feed fetched successfully');
});

// GET /api/news/trending
const getTrending = asyncHandler(async (req, res) => {
    const news = await newsService.getTrendingNews({ limit: req.query.limit });
    apiResponse(res, 200, { news }, 'Trending news fetched');
});

// GET /api/news/search
const search = asyncHandler(async (req, res) => {
    const result = await newsService.searchNews(req.query);
    apiResponse(res, 200, result, 'Search results');
});

// GET /api/news/:id
const getById = asyncHandler(async (req, res) => {
    const news = await newsService.getNewsById(req.params.id);
    apiResponse(res, 200, { news }, 'News article fetched');
});

// GET /api/news/category/:category
const getByCategory = asyncHandler(async (req, res) => {
    const result = await newsService.getNewsByCategory(req.params.category, req.query);
    apiResponse(res, 200, result, 'Category news fetched');
});

// GET /api/news/languages
const getLanguages = asyncHandler(async (req, res) => {
    const Language = require('../models/Language');
    const languages = await Language.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
    apiResponse(res, 200, { languages }, 'Languages fetched');
});

// GET /api/news/config
const getConfig = asyncHandler(async (req, res) => {
    const result = await newsService.getBootstrapConfig();
    apiResponse(res, 200, result, 'Config fetched');
});

module.exports = { getFeed, getTrending, search, getById, getByCategory, getLanguages, getConfig };
