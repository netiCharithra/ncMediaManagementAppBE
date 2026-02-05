const express = require('express');
const router = express.Router();

// Import mobile-specific controller functions here
const { getPriorityNews, getLatestNews, getMetaData, searchNews, getIndividualNewsInfo, getHelpTeam, getNewsFrames, addNewsFrame, updateNewsFrame, getNewsFrameById, getActiveNewsFrames, getScreenPermissions, updateScreenPermissions, toggleScreenPermission, getEmployeesList, logNewsFrameSharing, newsSharingAnalytics, getNewsWithSharingInfo, registerMobileUser } = require('../controllers/mobileAPIFunctions');

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
 *         employeeId:
 *           type: string
 *           description: ID of the employee this permission applies to
 *         screens:
 *           type: object
 *           properties:
 *             dashboard:
 *               type: boolean
 *               description: Permission for dashboard access
 *             newsManagement:
 *               type: boolean
 *               description: Permission for news management
 *             employeeManagement:
 *               type: boolean
 *               description: Permission for employee management
 *             employeeTracing:
 *               type: boolean
 *               description: Permission for employee tracing
 *             newsFrameManagement:
 *               type: boolean
 *               description: Permission for news frame management
 *             userScreensPermissionManagement:
 *               type: boolean
 *               description: Permission for user screens permission management
 *         createdOn:
 *           type: number
 *           description: Timestamp when the permissions were created
 *         createdBy:
 *           type: string
 *           description: ID of the employee who created the permissions
 *         lastUpdatedOn:
 *           type: number
 *           description: Timestamp when the permissions were last updated
 *         lastUpdatedBy:
 *           type: string
 *           description: ID of the employee who last updated the permissions
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
 *                 example: NC-AP-2
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
 *                   $ref: '#/components/schemas/ScreenPermission'
 *                 msg:
 *                   type: string
 *                   example: Screen permissions retrieved successfully
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
 *               loggedEmployeeId:
 *                 type: string
 *                 description: ID of the employee making the request
 *                 example: NC-AP-1
 *               employeeId:
 *                 type: string
 *                 description: ID of the employee whose permissions are being updated
 *                 example: NC-AP-2
 *               permissions:
 *                 type: object
 *                 properties:
 *                   dashboard:
 *                     type: boolean
 *                     description: Permission for dashboard access
 *                   newsManagement:
 *                     type: boolean
 *                     description: Permission for news management
 *                   employeeManagement:
 *                     type: boolean
 *                     description: Permission for employee management
 *                   employeeTracing:
 *                     type: boolean
 *                     description: Permission for employee tracing
 *                   newsFrameManagement:
 *                     type: boolean
 *                     description: Permission for news frame management
 *                   userScreensPermissionManagement:
 *                     type: boolean
 *                     description: Permission for user screens permission management
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
 *                   $ref: '#/components/schemas/ScreenPermission'
 *                 msg:
 *                   type: string
 *                   example: Screen permissions updated successfully
 *       403:
 *         description: Not authorized to update permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 msg:
 *                   type: string
 *                   example: Not authorized to update permissions for this employee
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
 *               loggedEmployeeId:
 *                 type: string
 *                 description: ID of the employee making the request
 *                 example: NC-AP-1
 *               employeeId:
 *                 type: string
 *                 description: ID of the employee whose permission is being toggled
 *                 example: NC-AP-2
 *               screenName:
 *                 type: string
 *                 description: Name of the screen permission to toggle
 *                 enum: [dashboard, newsManagement, employeeManagement, employeeTracing, newsFrameManagement, userScreensPermissionManagement]
 *                 example: dashboard
 *               isEnabled:
 *                 type: boolean
 *                 description: New permission status
 *                 example: true
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
 *                 msg:
 *                   type: string
 *                   example: Screen permission for dashboard set to true
 *       403:
 *         description: Not authorized to update permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 *                 msg:
 *                   type: string
 *                   example: Not authorized to update permissions for this employee
 */
router.route('/toggleScreenPermission').post(toggleScreenPermission);

/**
 * @swagger
 * /mobile/getEmployeesList:
 *   post:
 *     summary: Get list of all employees with optional filtering
 *     tags: [Mobile]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               searchTerm:
 *                 type: string
 *                 description: Term to search for in name or employee ID
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *                 default: 1
 *               limit:
 *                 type: number
 *                 description: Number of employees per page
 *                 default: 10
 *     responses:
 *       200:
 *         description: List of employees
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
 *                     employees:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           employeeId:
 *                             type: string
 *                           mail:
 *                             type: string
 *                           mobile:
 *                             type: number
 *                           role:
 *                             type: string
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         totalEmployees:
 *                           type: number
 *                         totalPages:
 *                           type: number
 *                         currentPage:
 *                           type: number
 *                         limit:
 *                           type: number
 */
router.route('/getEmployeesList').post(getEmployeesList);


router.route('/logNewsFrameSharing').post(logNewsFrameSharing);

router.route('/newsSharingAnalytics').post(newsSharingAnalytics);

router.route('/getNewsWithSharingInfo').post(getNewsWithSharingInfo);

/**
 * @swagger
 * /mobile/registerMobileUser:
 *   post:
 *     summary: Register or update mobile user for push notifications
 *     tags: [Mobile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: FCM token for push notifications
 *               latitude:
 *                 type: number
 *                 description: User's latitude
 *               longitude:
 *                 type: number
 *                 description: User's longitude
 *               language:
 *                 type: string
 *                 description: Preferred language code (en, te, hi, etc.)
 *               userId:
 *                 type: string
 *                 description: Device/User identifier
 *     responses:
 *       200:
 *         description: Mobile user registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     fcmToken:
 *                       type: string
 *                     language:
 *                       type: string
 *                     location:
 *                       type: object
 *                     totalAccess:
 *                       type: number
 *                     lastAccess:
 *                       type: number
 */
router.route('/registerMobileUser').post(registerMobileUser);

module.exports = router;
