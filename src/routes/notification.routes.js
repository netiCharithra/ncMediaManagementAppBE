'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { apiResponse } = require('../utils/helpers');
const { authenticate } = require('../middlewares/auth.middleware');
const notificationService = require('../services/notification.service');

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Push notification history
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get notification history
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Notification history fetched
 *       401:
 *         description: Unauthorized
 */
// GET /api/notifications  (admin or authenticated user)
router.get(
    '/',
    authenticate,
    asyncHandler(async (req, res) => {
        const result = await notificationService.getNotificationHistory(req.query);
        apiResponse(res, 200, result, 'Notification history');
    })
);

module.exports = router;
