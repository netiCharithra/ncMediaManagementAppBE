'use strict';

const router = require('express').Router();
const newsController = require('../controllers/news.controller');
const { cacheMiddleware } = require('../utils/cache');

// Cache key builders
const feedCacheKey = (req) =>
    `news:feed:${req.query.district || 'all'}:${req.query.state || 'AP'}:${req.query.page || 1}:${req.query.limit || 20}`;

const trendingCacheKey = () => 'news:trending';

/**
 * @swagger
 * tags:
 *   name: News
 *   description: News feed and article endpoints
 */

/**
 * @swagger
 * /api/news/feed:
 *   get:
 *     summary: Get hyperlocal prioritized feed
 *     tags: [News]
 *     parameters:
 *       - in: query
 *         name: district
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Feed fetched successfully
 */
// GET /api/news/feed  - Hyperlocal prioritised feed
router.get('/feed', cacheMiddleware(feedCacheKey, 120), newsController.getFeed);

/**
 * @swagger
 * /api/news/trending:
 *   get:
 *     summary: Get trending news
 *     tags: [News]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Trending news fetched
 */
// GET /api/news/trending
router.get('/trending', cacheMiddleware(trendingCacheKey, 60), newsController.getTrending);

/**
 * @swagger
 * /api/news/search:
 *   get:
 *     summary: Search for news
 *     tags: [News]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: true
 *       - in: query
 *         name: district
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results
 */
// GET /api/news/search
router.get('/search', newsController.search);

/**
 * @swagger
 * /api/news/category/{category}:
 *   get:
 *     summary: Get news by category
 *     tags: [News]
 *     parameters:
 *       - in: path
 *         name: category
 *         schema:
 *           type: string
 *         required: true
 *         description: Category slug
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category news fetched
 */
// GET /api/news/category/:category
router.get('/category/:category', cacheMiddleware((req) => `news:category:${req.params.category}:${req.query.page || 1}`, 180), newsController.getByCategory);

/**
 * @swagger
 * /api/news/{id}:
 *   get:
 *     summary: Get a single news article by ID
 *     tags: [News]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: News article fetched
 *       404:
 *         description: News article not found
 */
/**
 * @swagger
 * /api/news/languages:
 *   get:
 *     summary: Get all supported languages
 *     tags: [News]
 *     responses:
 *       200:
 *         description: List of supported languages fetched
 */
// GET /api/news/languages
router.get('/languages', newsController.getLanguages);

/**
 * @swagger
 * /api/news/config:
 *   get:
 *     summary: Get unified app configuration (languages + categories)
 *     tags: [News]
 *     responses:
 *       200:
 *         description: Config fetched
 */
// GET /api/news/config (24 hour cache)
router.get('/config', cacheMiddleware(() => 'news:config', 24 * 60 * 60), newsController.getConfig);

// GET /api/news/:id  — must come last to avoid catching static paths
router.get('/:id', cacheMiddleware((req) => `news:article:${req.params.id}`, 300), newsController.getById);

module.exports = router;
