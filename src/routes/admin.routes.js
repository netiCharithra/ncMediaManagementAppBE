'use strict';

const router = require('express').Router();
const { body, param, query } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const { authenticate, authorize, authorizePermission } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');
const { logMultipartPayload } = require('../utils/r2');
const { validate } = require('../middlewares/validate.middleware');

// Accessible to all admin roles (admin, super_admin, editor)
const isAdmin = [authenticate, authorize('admin', 'super_admin', 'editor')];
// Accessible only to super_admin and admin (not editor)
const isSuperAdmin = [authenticate, authorize('super_admin')];

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin dashboard and management endpoints
 */

/**
 * @swagger
 * /admin/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
// POST /admin/login
router.post(
    '/login',
    [
        body('password').notEmpty(),
        body('email').optional().isEmail().normalizeEmail(),
        body('phone').optional().isString(),
    ],
    validate,
    adminController.login
);

/**
 * @swagger
 * /admin/scheduler/status:
 *   get:
 *     summary: Get live scheduler status dashboard
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Dashboard HTML fetched
 */
router.get('/scheduler/status', adminController.getSchedulerStatus);

// ─── Protected admin routes ────────────────────────────────────────────────────
router.use(isAdmin);

/**
 * @swagger
 * /admin/dashboard/stats:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: ISO language code (te, en, hi, etc.)
 *     responses:
 *       200:
 *         description: Stats fetched successfully
 */
// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

/**
 * @swagger
 * /admin/news:
 *   get:
 *     summary: List and search all news articles (for management)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query for title or slug
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, published, review, draft, rejected, archived]
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: News articles listed
 */
// News management
router.get(
    '/news',
    [
        query('q').optional().isString().isLength({ max: 100 }).withMessage('Search query too long'),
        query('page').optional().isInt({ min: 1 }).toInt(),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    ],
    validate,
    adminController.listNews
);

/**
 * @swagger
 * /admin/news/{id}:
 *   get:
 *     summary: Get details of a specific news article
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the news article
 *     responses:
 *       200:
 *         description: News article details fetched successfully
 *       404:
 *         description: News article not found
 */
router.get('/news/:id', adminController.getNewsDetail);

/**
 * @swagger
 * /admin/news:
 *   post:
 *     summary: Create news directly
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - category
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               category:
 *                 type: string
 *                 description: Category ObjectId
 *               image:
 *                 type: string
 *                 format: binary
 *               imageCaption:
 *                 type: string
 *               location_district:
 *                 type: string
 *               location_state:
 *                 type: string
 *               location_scope:
 *                 type: string
 *               isBreaking:
 *                 type: boolean
 *               originalLanguage:
 *                 type: string
 *                 description: ISO code (te, en, hi, etc.)
 *                 default: te
 *     responses:
 *       201:
 *         description: News created
 */
// News management
router.post(
    '/news',
    upload.single('image'),
    logMultipartPayload,
    [
        body('title').trim().notEmpty().withMessage('Title is required'),
        body('content').notEmpty().withMessage('Content is required'),
        body('category').notEmpty().withMessage('Category ID is required'),
    ],
    validate,
    adminController.createNews
);

// ─── Bulk Publish (editor + super_admin) ──────────────────────────────────────
/**
 * @swagger
 * /admin/news/bulk-publish:
 *   put:
 *     summary: Bulk approve and publish news articles in review
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific news IDs to publish (optional)
 *               language:
 *                 type: string
 *                 description: Filter by originalLanguage to publish all of that language
 *     responses:
 *       200:
 *         description: Bulk publish result
 */
router.put(
    '/news/bulk-publish',
    authorizePermission('bulkPublish'),
    adminController.bulkPublishNews
);

/**
 * @swagger
 * /admin/news/{id}:
 *   put:
 *     summary: Update a news article
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated successfully
 */
router.put('/news/:id', upload.single('image'), logMultipartPayload, adminController.updateNews);

/**
 * @swagger
 * /admin/news/{id}:
 *   delete:
 *     summary: Delete a news article
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted successfully
 */
router.delete('/news/:id', adminController.deleteNews);
/**
 * @swagger
 * /admin/news/{id}/publish:
 *   put:
 *     summary: Publish a news article in review
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Published successfully
 */
router.put('/news/:id/publish', adminController.publishNews);

// ─── Editor Management (super_admin only) ─────────────────────────────────────
/**
 * @swagger
 * /admin/editors:
 *   post:
 *     summary: Create a new editor account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/editors',
    [authenticate, authorize('super_admin')],
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('phone').optional().isString(),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    ],
    validate,
    adminController.createEditorAccount
);

/**
 * @swagger
 * /admin/editors:
 *   get:
 *     summary: List all editor accounts
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/editors', [authenticate, authorize('super_admin')], adminController.listEditors);

/**
 * @swagger
 * /admin/editors/{id}/permissions:
 *   patch:
 *     summary: Update an editor's permissions
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
    '/editors/:id/permissions',
    [authenticate, authorize('super_admin')],
    adminController.updateEditorPermissions
);

/**
 * @swagger
 * /admin/raw-news:
 *   get:
 *     summary: List raw news items
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Raw news listed successfully
 */
// Raw news management
router.get('/raw-news', adminController.listRawNews);

/**
 * @swagger
 * /admin/contributors:
 *   get:
 *     summary: List all contributors
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contributors listed
 */
// Contributor management
router.get('/contributors', adminController.listContributors);

/**
 * @swagger
 * /admin/contributors/{id}/approve:
 *   put:
 *     summary: Approve a contributor
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contributor approved
 */
router.put('/contributors/:id/approve', adminController.approveContributor);

/**
 * @swagger
 * /admin/notification:
 *   post:
 *     summary: Send push notification
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - body
 *               - targetAudience
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               targetAudience:
 *                 type: string
 *                 enum: [all, district, state, national]
 *     responses:
 *       200:
 *         description: Notification sent
 */
// Notifications
router.post(
    '/notification',
    [
        body('title').notEmpty().withMessage('Title is required'),
        body('body').notEmpty().withMessage('Body is required'),
        body('targetAudience').isIn(['all', 'district', 'state', 'national']),
    ],
    validate,
    adminController.sendNotification
);

module.exports = router;
