const express = require('express');
const router = express.Router();
const { 
    fetchNewsListPending, 
    fetchNewsListApproved, 
    fetchNewsListRejected, 
    getAllActiveEmployees, 
    manipulateNews, 
    getAdminIndividualNewsInfo, 
    getEmployeesDataPaginated, 
    getIndividualEmployeeData, 
    manipulateIndividualEmployee, 
    employeeTracingListing,
    employeeTracingManagement, 
    employeeTracingActiveEmployeeList, 
    getArticlesDashbordInfo, 
    getPageViewDashboardInfo, 
    getArticlesByCategory, 
    getActiveEmployeeStats, 
    getVisitorTimeSeries, 
    getVisitsTimeSeries, 
    getVisitorLocations,
    convertPresignedUrlToBase64API,
    getImageDownloadUrl,
    getEmployeeArticlesStats,
    getOverallArticlesStats,
    generateScreenPermissionsForAllEmployees,
} = require('../controllers/adminstrationAPIFunction');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Administration endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Employee:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated ID of the employee
 *         name:
 *           type: string
 *           description: Employee name
 *         email:
 *           type: string
 *           description: Employee email
 *         role:
 *           type: string
 *           description: Employee role
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           description: Current status of the employee
 *     EmployeeTracing:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated ID
 *         employeeId:
 *           type: string
 *           description: ID of the employee
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Timestamp of the tracing record
 *         location:
 *           type: object
 *           properties:
 *             latitude:
 *               type: number
 *             longitude:
 *               type: number
 *         activity:
 *           type: string
 *           description: Activity description
 *     DashboardStats:
 *       type: object
 *       properties:
 *         totalArticles:
 *           type: number
 *           description: Total number of articles
 *         approvedArticles:
 *           type: number
 *           description: Number of approved articles
 *         pendingArticles:
 *           type: number
 *           description: Number of pending articles
 *         rejectedArticles:
 *           type: number
 *           description: Number of rejected articles
 */

// All routes in this file are protected by adminAuth middleware
// which is applied in commonRoute.js

// News management routes
/**
 * @swagger
 * /admin/news/pending:
 *   post:
 *     summary: Get pending news articles
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: number
 *                 description: Number of items to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *     responses:
 *       200:
 *         description: List of pending news articles
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
router.route('/news/pending').post(fetchNewsListPending);

/**
 * @swagger
 * /admin/news/approved:
 *   post:
 *     summary: Get approved news articles
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: number
 *                 description: Number of items to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *     responses:
 *       200:
 *         description: List of approved news articles
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
router.route('/news/approved').post(fetchNewsListApproved);

/**
 * @swagger
 * /admin/news/rejected:
 *   post:
 *     summary: Get rejected news articles
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: number
 *                 description: Number of items to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *     responses:
 *       200:
 *         description: List of rejected news articles
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
router.route('/news/rejected').post(fetchNewsListRejected);

/**
 * @swagger
 * /admin/news/active-employees:
 *   post:
 *     summary: Get list of active employees
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List of active employees
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
 *                     $ref: '#/components/schemas/Employee'
 */
router.route('/news/active-employees').post(getAllActiveEmployees);

/**
 * @swagger
 * /admin/news/manipulateNews:
 *   post:
 *     summary: Approve, reject or update news articles
 *     tags: [Admin]
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
 *               action:
 *                 type: string
 *                 enum: [approve, reject, update]
 *                 description: Action to perform
 *               updateData:
 *                 type: object
 *                 description: Data to update (required if action is update)
 *     responses:
 *       200:
 *         description: Result of the manipulation
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
router.route('/news/manipulateNews').post(manipulateNews);

/**
 * @swagger
 * /admin/news/getIndividualNewsInfo:
 *   post:
 *     summary: Get detailed information about a specific news article
 *     tags: [Admin]
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
router.route('/news/getIndividualNewsInfo').post(getAdminIndividualNewsInfo);

// Employee management routes
/**
 * @swagger
 * /admin/employeesData:
 *   post:
 *     summary: Get paginated list of employees
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: number
 *                 description: Number of items to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *               status:
 *                 type: string
 *                 enum: [active, inactive, all]
 *                 description: Filter by employee status
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
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Employee'
 */
router.route('/employeesData').post(getEmployeesDataPaginated);

/**
 * @swagger
 * /admin/individualEmployeeData:
 *   post:
 *     summary: Get detailed information about a specific employee
 *     tags: [Admin]
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
 *         description: Detailed employee information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Employee'
 */
router.route('/individualEmployeeData').post(getIndividualEmployeeData);

/**
 * @swagger
 * /admin/manipulateIndividualEmployee:
 *   post:
 *     summary: Create, update or deactivate an employee
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [create, update, deactivate]
 *                 description: Action to perform
 *               employeeId:
 *                 type: string
 *                 description: ID of the employee (not required for create)
 *               employeeData:
 *                 type: object
 *                 description: Employee data for create/update
 *     responses:
 *       200:
 *         description: Result of the manipulation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Employee'
 */
router.route('/manipulateIndividualEmployee').post(manipulateIndividualEmployee);

// Employee tracing routes
/**
 * @swagger
 * /admin/employeeTracingListing:
 *   post:
 *     summary: Get employee tracing records
 *     tags: [Admin]
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
 *               limit:
 *                 type: number
 *                 description: Number of items to return
 *               page:
 *                 type: number
 *                 description: Page number for pagination
 *     responses:
 *       200:
 *         description: List of employee tracing records
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
 *                     $ref: '#/components/schemas/EmployeeTracing'
 */
router.route('/employeeTracingListing').post(employeeTracingListing);

/**
 * @swagger
 * /admin/employeeTracingManagement:
 *   post:
 *     summary: Manage employee tracing settings
 *     tags: [Admin]
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
 *               action:
 *                 type: string
 *                 enum: [enable, disable]
 *                 description: Action to perform on tracing
 *     responses:
 *       200:
 *         description: Result of the management action
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
 */
router.route('/employeeTracingManagement').post(employeeTracingManagement);

/**
 * @swagger
 * /admin/employeeTracingActiveEmployeeList:
 *   post:
 *     summary: Get list of employees with active tracing
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List of employees with active tracing
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
 *                     $ref: '#/components/schemas/Employee'
 */
router.route('/employeeTracingActiveEmployeeList').post(employeeTracingActiveEmployeeList);

// Dashboard and analytics routes
/**
 * @swagger
 * /admin/dashboard/articles:
 *   post:
 *     summary: Get dashboard information about articles
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Dashboard article statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/DashboardStats'
 */
router.route('/dashboard/articles').post(getArticlesDashbordInfo);

/**
 * @swagger
 * /admin/dashboard/employee-articles-stats:
 *   post:
 *     summary: Get article statistics by employee
 *     tags: [Admin]
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
 *         description: Employee article statistics
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
 *                     totalArticles:
 *                       type: number
 *                     approvedArticles:
 *                       type: number
 *                     pendingArticles:
 *                       type: number
 *                     rejectedArticles:
 *                       type: number
 */
router.route('/dashboard/employee-articles-stats').post(getEmployeeArticlesStats);

/**
 * @swagger
 * /admin/dashboard/overall-articles-stats:
 *   post:
 *     summary: Get overall article statistics
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Overall article statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/DashboardStats'
 */
router.route('/dashboard/overall-articles-stats').post(getOverallArticlesStats);

/**
 * @swagger
 * /admin/dashboard/page-views:
 *   post:
 *     summary: Get page view statistics
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Page view statistics
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
 *                     totalViews:
 *                       type: number
 *                     uniqueVisitors:
 *                       type: number
 */
router.route('/dashboard/page-views').post(getPageViewDashboardInfo);

/**
 * @swagger
 * /admin/dashboard/articles-by-category:
 *   post:
 *     summary: Get article statistics by category
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Article statistics by category
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
 *                       category:
 *                         type: string
 *                       count:
 *                         type: number
 */
router.route('/dashboard/articles-by-category').post(getArticlesByCategory);

/**
 * @swagger
 * /admin/dashboard/active-employee-stats:
 *   post:
 *     summary: Get statistics about active employees
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Active employee statistics
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
 *                     totalEmployees:
 *                       type: number
 *                     activeEmployees:
 *                       type: number
 */
router.route('/dashboard/active-employee-stats').post(getActiveEmployeeStats);

/**
 * @swagger
 * /admin/dashboard/visitor-time-series:
 *   post:
 *     summary: Get visitor statistics over time
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               period:
 *                 type: string
 *                 enum: [day, week, month, year]
 *                 description: Time period for the statistics
 *     responses:
 *       200:
 *         description: Visitor time series data
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
 *                       date:
 *                         type: string
 *                       visitors:
 *                         type: number
 */
router.route('/dashboard/visitor-time-series').post(getVisitorTimeSeries);

/**
 * @swagger
 * /admin/dashboard/visits-time-series:
 *   post:
 *     summary: Get visit statistics over time
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               period:
 *                 type: string
 *                 enum: [day, week, month, year]
 *                 description: Time period for the statistics
 *     responses:
 *       200:
 *         description: Visit time series data
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
 *                       date:
 *                         type: string
 *                       visits:
 *                         type: number
 */
router.route('/dashboard/visits-time-series').post(getVisitsTimeSeries);

/**
 * @swagger
 * /admin/dashboard/visitor-locations:
 *   post:
 *     summary: Get visitor statistics by location
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Visitor location data
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
 *                       location:
 *                         type: string
 *                       visitors:
 *                         type: number
 */
router.route('/dashboard/visitor-locations').post(getVisitorLocations);

// Utility routes
/**
 * @swagger
 * /admin/utils/presigned-url-to-base64:
 *   post:
 *     summary: Convert a presigned URL to base64
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 description: Presigned URL to convert
 *     responses:
 *       200:
 *         description: Base64 encoded image
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
 *                     base64:
 *                       type: string
 */
router.route('/utils/presigned-url-to-base64').post(convertPresignedUrlToBase64API);

/**
 * @swagger
 * /admin/utils/get-image-url:
 *   post:
 *     summary: Get a downloadable URL for an image
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileName:
 *                 type: string
 *                 description: Name of the file
 *               bucketType:
 *                 type: string
 *                 enum: [articles, news-frames, employee-docs]
 *                 description: Type of bucket where the file is stored
 *     responses:
 *       200:
 *         description: Downloadable URL
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
 *                     url:
 *                       type: string
 */
router.route('/utils/get-image-url').post(getImageDownloadUrl);

// Mobile screen management routes
/**
 * @swagger
 * /admin/mobile-screens/generate-all:
 *   post:
 *     summary: Generate screen permissions for all employees
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Result of the generation
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
 *                     generatedCount:
 *                       type: number
 */
router.route('/mobile-screens/generate-all').post(generateScreenPermissionsForAllEmployees);

module.exports = router;
