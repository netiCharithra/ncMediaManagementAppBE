const express = require('express');
const router = express.Router();

// Import mobile-specific controller functions here
const { getPriorityNews, getLatestNews, getMetaData, searchNews, getIndividualNewsInfo, getHelpTeam, getNewsFrames, addNewsFrame, updateNewsFrame, getNewsFrameById, getActiveNewsFrames, getScreenPermissions, updateScreenPermissions, toggleScreenPermission } = require('../controllers/mobileAPIFunctions');

/**
 * @swagger
 * tags:
 *   name: Mobile
 *   description: Mobile application endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     News:
 *       type: object
 *       required:
 *         - title
 *         - content
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
 *         priority:
 *           type: number
 *           description: News priority level
 *         status:
 *           type: string
 *           enum: [pending, approved, rejected]
 *           description: Current status of the news
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *     NewsFrame:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated ID of the news frame
 *         title:
 *           type: string
 *           description: Frame title
 *         imageUrl:
 *           type: string
 *           description: URL to the frame image
 *         isActive:
 *           type: boolean
 *           description: Whether the frame is active
 *     ScreenPermission:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated ID
 *         screenId:
 *           type: string
 *           description: Screen identifier
 *         screenName:
 *           type: string
 *           description: Name of the screen
 *         isEnabled:
 *           type: boolean
 *           description: Whether the screen is enabled
 *         employeeId:
 *           type: string
 *           description: ID of the employee this permission applies to
 */

/**
 * Mobile API Routes
 * All routes in this file are prefixed with /api/v3/mobile
 */

// News feed routes
/**
 * @swagger
 * /mobile/getPriorityNews:
 *   post:
 *     summary: Get priority news
 *     tags: [Mobile]
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
 *     responses:
 *       200:
 *         description: List of priority news
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
 *                     $ref: '#/components/schemas/News'
 */
router.route('/getPriorityNews').post(getPriorityNews);

/**
 * @swagger
 * /mobile/getLatestNews:
 *   post:
 *     summary: Get latest news
 *     tags: [Mobile]
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
 *                     $ref: '#/components/schemas/News'
 */
router.route('/getLatestNews').post(getLatestNews);

/**
 * @swagger
 * /mobile/getMetaData:
 *   post:
 *     summary: Get metadata for the application
 *     tags: [Mobile]
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
 */
router.route('/getMetaData').post(getMetaData);

/**
 * @swagger
 * /mobile/searchNews:
 *   post:
 *     summary: Search news articles
 *     tags: [Mobile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               searchTerm:
 *                 type: string
 *                 description: Term to search for
 *               limit:
 *                 type: number
 *                 description: Number of results to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *     responses:
 *       200:
 *         description: Search results
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
 *                     $ref: '#/components/schemas/News'
 */
router.route('/searchNews').post(searchNews);

/**
 * @swagger
 * /mobile/getIndividualNewsInfo:
 *   post:
 *     summary: Get detailed information about a specific news article
 *     tags: [Mobile]
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
 *                   $ref: '#/components/schemas/News'
 */
router.route('/getIndividualNewsInfo').post(getIndividualNewsInfo);

/**
 * @swagger
 * /mobile/getHelpTeam:
 *   post:
 *     summary: Get help team contact information
 *     tags: [Mobile]
 *     responses:
 *       200:
 *         description: Help team information
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
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       contact:
 *                         type: string
 *                       role:
 *                         type: string
 */
router.route('/getHelpTeam').post(getHelpTeam);

/**
 * @swagger
 * /mobile/getNewsFrames:
 *   post:
 *     summary: Get all news frames
 *     tags: [Mobile]
 *     responses:
 *       200:
 *         description: List of all news frames
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
 *                     $ref: '#/components/schemas/NewsFrame'
 */
router.route('/getNewsFrames').post(getNewsFrames);

/**
 * @swagger
 * /mobile/getActiveNewsFrames:
 *   post:
 *     summary: Get active news frames only
 *     tags: [Mobile]
 *     responses:
 *       200:
 *         description: List of active news frames
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
 *                     $ref: '#/components/schemas/NewsFrame'
 */
router.route('/getActiveNewsFrames').post(getActiveNewsFrames);

/**
 * @swagger
 * /mobile/createFrame:
 *   post:
 *     summary: Create a new news frame
 *     tags: [Mobile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Frame title
 *               imageUrl:
 *                 type: string
 *                 description: URL to the frame image
 *               isActive:
 *                 type: boolean
 *                 description: Whether the frame is active
 *     responses:
 *       200:
 *         description: Created news frame
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/NewsFrame'
 */
router.route('/createFrame').post(addNewsFrame);

/**
 * @swagger
 * /mobile/updateFrame:
 *   post:
 *     summary: Update an existing news frame
 *     tags: [Mobile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               frameId:
 *                 type: string
 *                 description: ID of the frame to update
 *               title:
 *                 type: string
 *                 description: Frame title
 *               imageUrl:
 *                 type: string
 *                 description: URL to the frame image
 *               isActive:
 *                 type: boolean
 *                 description: Whether the frame is active
 *     responses:
 *       200:
 *         description: Updated news frame
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/NewsFrame'
 */
router.route('/updateFrame').post(updateNewsFrame);

/**
 * @swagger
 * /mobile/getFrameById:
 *   post:
 *     summary: Get a news frame by ID
 *     tags: [Mobile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               frameId:
 *                 type: string
 *                 description: ID of the frame to retrieve
 *     responses:
 *       200:
 *         description: News frame details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/NewsFrame'
 */
router.route('/getFrameById').post(getNewsFrameById);

// Mobile Screen Management routes
/**
 * @swagger
 * /mobile/getScreenPermissions:
 *   post:
 *     summary: Get screen permissions for a user
 *     tags: [Mobile]
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
 *         description: Screen permissions for the employee
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
 *                     $ref: '#/components/schemas/ScreenPermission'
 */
router.route('/getScreenPermissions').post(getScreenPermissions);

/**
 * @swagger
 * /mobile/updateScreenPermissions:
 *   post:
 *     summary: Update screen permissions for a user
 *     tags: [Mobile]
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
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     screenId:
 *                       type: string
 *                     isEnabled:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Updated screen permissions
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
 *                     $ref: '#/components/schemas/ScreenPermission'
 */
router.route('/updateScreenPermissions').post(updateScreenPermissions);

/**
 * @swagger
 * /mobile/toggleScreenPermission:
 *   post:
 *     summary: Toggle a single screen permission
 *     tags: [Mobile]
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
 *               screenId:
 *                 type: string
 *                 description: ID of the screen
 *               isEnabled:
 *                 type: boolean
 *                 description: New permission status
 *     responses:
 *       200:
 *         description: Updated permission status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/ScreenPermission'
 */
router.route('/toggleScreenPermission').post(toggleScreenPermission);

module.exports = router;
