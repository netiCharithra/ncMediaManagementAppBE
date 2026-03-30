'use strict';

const router = require('express').Router();
const { body } = require('express-validator');
const contributorController = require('../controllers/contributor.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');

const isContributor = [authenticate, authorize('contributor')];

/**
 * @swagger
 * tags:
 *   name: Contributor
 *   description: Contributor portal endpoints
 */

/**
 * @swagger
 * /contributor/register:
 *   post:
 *     summary: Register as a contributor
 *     tags: [Contributor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               coveringDistricts:
 *                 type: array
 *                 items:
 *                   type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Registration successful
 */
// POST /contributor/register
router.post(
    '/register',
    [
        body('name').trim().notEmpty(),
        body('email').isEmail().normalizeEmail(),
        body('password').isLength({ min: 6 }),
    ],
    validate,
    contributorController.register
);

/**
 * @swagger
 * /contributor/login:
 *   post:
 *     summary: Login as a contributor
 *     tags: [Contributor]
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
 */
// POST /contributor/login
router.post(
    '/login',
    [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
    validate,
    contributorController.login
);

// ─── Protected contributor routes ─────────────────────────────────────────────
router.use(isContributor);

/**
 * @swagger
 * /contributor/profile:
 *   get:
 *     summary: Get contributor profile
 *     tags: [Contributor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 */
// GET /contributor/profile
router.get('/profile', contributorController.getProfile);

/**
 * @swagger
 * /contributor/news:
 *   post:
 *     summary: Submit a news article for review
 *     tags: [Contributor]
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
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Article submitted
 */
// POST /contributor/news – submit a news article
router.post(
    '/news',
    [
        body('title').trim().notEmpty().withMessage('Title is required'),
        body('content').notEmpty().withMessage('Content is required'),
    ],
    validate,
    contributorController.submitNews
);

/**
 * @swagger
 * /contributor/news:
 *   get:
 *     summary: View own news submissions
 *     tags: [Contributor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: News fetched successfully
 */
// GET /contributor/news – view own submissions
router.get('/news', contributorController.getMyNews);

module.exports = router;
