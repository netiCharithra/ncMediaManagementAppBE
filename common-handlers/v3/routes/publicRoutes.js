const express = require('express');
const router = express.Router();
const { 
    getLatestNews, 
    getMetaData, 
    getNewsTypeCategorizedNews, 
    getNewsCategoryCategorizedNews, 
    getCategoryNewsPaginatedOnly, 
    getIndividualNewsInfo, 
    employeeTraceCheck, 
    getVisitorsCount, 
    getTypeCategorizedNewsPaginatedOnly
} = require('../controllers/publicApiFunction');
const otpAuthRoutes = require('./../otpAuth');

/**
 * @swagger
 * tags:
 *   name: Public
 *   description: Public endpoints that don't require authentication
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PublicNews:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated ID of the news
 *         title:
 *           type: string
 *           description: News title
 *         content:
 *           type: string
 *           description: News content
 *         category:
 *           type: string
 *           description: News category
 *         type:
 *           type: string
 *           description: News type
 *         imageUrl:
 *           type: string
 *           description: URL to the news image
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *     VisitorStats:
 *       type: object
 *       properties:
 *         totalVisitors:
 *           type: number
 *           description: Total number of visitors
 *         uniqueVisitors:
 *           type: number
 *           description: Number of unique visitors
 */

// Add OTP authentication routes
console.log('Registering OTP routes...');
router.use(otpAuthRoutes);
console.log('OTP routes registered');

// Public API routes

/**
 * @swagger
 * /public/home/getLatestNews:
 *   post:
 *     summary: Get latest news for public display
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: number
 *                 description: Number of news items to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *     responses:
 *       200:
 *         description: List of latest news
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PublicNews'
 */
router.route('/public/home/getLatestNews').post(getLatestNews);

/**
 * @swagger
 * /public/home/getNewsTypeCategorizedNews:
 *   post:
 *     summary: Get news categorized by type
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 description: News type to filter by
 *               limit:
 *                 type: number
 *                 description: Number of news items to return
 *     responses:
 *       200:
 *         description: News categorized by type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PublicNews'
 */
router.route('/public/home/getNewsTypeCategorizedNews').post(getNewsTypeCategorizedNews);

/**
 * @swagger
 * /public/home/getNewsCategoryCategorizedNews:
 *   post:
 *     summary: Get news categorized by category
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *                 description: News category to filter by
 *               limit:
 *                 type: number
 *                 description: Number of news items to return
 *     responses:
 *       200:
 *         description: News categorized by category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PublicNews'
 */
router.route('/public/home/getNewsCategoryCategorizedNews').post(getNewsCategoryCategorizedNews);

/**
 * @swagger
 * /public/home/getCategoryNewsPaginatedOnly:
 *   post:
 *     summary: Get paginated news by category
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *                 description: News category to filter by
 *               limit:
 *                 type: number
 *                 description: Number of news items to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *     responses:
 *       200:
 *         description: Paginated news by category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PublicNews'
 *                 totalPages:
 *                   type: number
 *                 currentPage:
 *                   type: number
 */
router.route('/public/home/getCategoryNewsPaginatedOnly').post(getCategoryNewsPaginatedOnly);

/**
 * @swagger
 * /public/home/getTypeCategorizedNewsPaginatedOnly:
 *   post:
 *     summary: Get paginated news by type
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 description: News type to filter by
 *               limit:
 *                 type: number
 *                 description: Number of news items to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *     responses:
 *       200:
 *         description: Paginated news by type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PublicNews'
 *                 totalPages:
 *                   type: number
 *                 currentPage:
 *                   type: number
 */
router.route('/public/home/getTypeCategorizedNewsPaginatedOnly').post(getTypeCategorizedNewsPaginatedOnly);

/**
 * @swagger
 * /public/metaData:
 *   post:
 *     summary: Get metadata for public display
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Application metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: string
 *                     types:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.route('/public/metaData').post(getMetaData);

/**
 * @swagger
 * /public/newsInfo:
 *   post:
 *     summary: Get detailed information about a specific news article
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newsId:
 *                 type: string
 *                 description: ID of the news article
 *     responses:
 *       200:
 *         description: Detailed news information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/PublicNews'
 */
router.route('/public/newsInfo').post(getIndividualNewsInfo);

/**
 * @swagger
 * /public/employeeTraceCheck:
 *   post:
 *     summary: Check employee tracing status
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               employeeId:
 *                 type: string
 *                 description: ID of the employee
 *     responses:
 *       200:
 *         description: Employee tracing status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     isTracingEnabled:
 *                       type: boolean
 */
router.route('/public/employeeTraceCheck').post(employeeTraceCheck);

/**
 * @swagger
 * /public/getVisitorsCount:
 *   post:
 *     summary: Get visitor statistics
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Visitor statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/VisitorStats'
 */
router.route('/public/getVisitorsCount').post(getVisitorsCount);

module.exports = router;
