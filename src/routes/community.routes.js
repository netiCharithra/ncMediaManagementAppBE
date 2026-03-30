'use strict';

const router = require('express').Router();
const { body, query } = require('express-validator');
const communityController = require('../controllers/community.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');

/**
 * @swagger
 * tags:
 *   name: Community
 *   description: Comments and Interactions (Likes/Dislikes)
 */

/**
 * @swagger
 * /api/community/interaction:
 *   post:
 *     summary: Toggle like/dislike on news or comment
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetId
 *               - targetModel
 *               - type
 *             properties:
 *               targetId:
 *                 type: string
 *               targetModel:
 *                 type: string
 *                 enum: [News, Comment]
 *               type:
 *                 type: string
 *                 enum: [like, dislike]
 *     responses:
 *       200:
 *         description: Interaction processed
 */
router.post(
    '/interaction',
    authenticate,
    [
        body('targetId').isMongoId().withMessage('Valid Target ID required'),
        body('targetModel').isIn(['News', 'Comment']).withMessage('Target model must be News or Comment'),
        body('type').isIn(['like', 'dislike']).withMessage('Type must be like or dislike'),
    ],
    validate,
    communityController.toggleInteraction
);

/**
 * @swagger
 * /api/community/comments:
 *   post:
 *     summary: Add a comment to news (or reply to a comment)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newsId
 *               - content
 *             properties:
 *               newsId:
 *                 type: string
 *               content:
 *                 type: string
 *               parentCommentId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment added
 */
router.post(
    '/comments',
    authenticate,
    [
        body('newsId').isMongoId().withMessage('Valid News ID required'),
        body('content').trim().notEmpty().withMessage('Comment content is required').isLength({ max: 1000 }),
        body('parentCommentId').optional().isMongoId().withMessage('Valid Parent Comment ID required'),
    ],
    validate,
    communityController.addComment
);

/**
 * @swagger
 * /api/community/comments/{newsId}:
 *   get:
 *     summary: Get comments for a news article
 *     tags: [Community]
 *     parameters:
 *       - in: path
 *         name: newsId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: parentCommentId
 *         schema:
 *           type: string
 *           description: Pass a parentCommentId to fetch nested replies
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Comments fetched
 */
router.get(
    '/comments/:newsId',
    [
        query('parentCommentId').optional().isMongoId(),
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
    ],
    validate,
    communityController.getComments
);

module.exports = router;
