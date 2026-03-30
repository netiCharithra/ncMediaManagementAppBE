'use strict';

const router = require('express').Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication endpoints
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
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
 *               phone:
 *                 type: string
 *               district:
 *                 type: string
 *               state:
 *                 type: string
 *               language:
 *                 type: string
 *     responses:
 *       201:
 *         description: Successfully registered
 *       409:
 *         description: Email or phone already registered
 */
// POST /api/auth/register
router.post(
    '/register',
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    ],
    validate,
    authController.register
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Authentication]
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
 *         description: Invalid email or password
 */
// POST /api/auth/login
router.post(
    '/login',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').notEmpty().withMessage('Password is required'),
    ],
    validate,
    authController.login
);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Login via Google
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Firebase Google ID Token
 *     responses:
 *       200:
 *         description: Login successful
 */
// POST /api/auth/google
router.post(
    '/google',
    [body('idToken').notEmpty().withMessage('Google ID token is required')],
    validate,
    authController.loginGoogle
);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Invalid or expired refresh token
 */
// POST /api/auth/refresh
router.post(
    '/refresh',
    [body('refreshToken').notEmpty().withMessage('Refresh token required')],
    validate,
    authController.refreshToken
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current logged in user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched
 *       401:
 *         description: Unauthorized
 */
// GET /api/auth/me  (protected)
router.get('/me', authenticate, authController.getMe);

/**
 * @swagger
 * /api/auth/fcm-token:
 *   post:
 *     summary: Update FCM device token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcmToken
 *             properties:
 *               fcmToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: FCM token updated successfully
 */
// POST /api/auth/fcm-token  (protected)
router.post(
    '/fcm-token',
    authenticate,
    [body('fcmToken').notEmpty().withMessage('FCM token required')],
    validate,
    authController.updateFcmToken
);

module.exports = router;
