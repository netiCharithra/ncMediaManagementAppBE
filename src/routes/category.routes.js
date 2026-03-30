'use strict';

const router = require('express').Router();
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const { apiResponse } = require('../utils/helpers');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { cacheMiddleware } = require('../utils/cache');

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Category endpoints
 */

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get all categories
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Categories fetched successfully
 */
// GET /api/categories
router.get(
    '/',
    cacheMiddleware('categories:all', 600),
    asyncHandler(async (_req, res) => {
        const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
        apiResponse(res, 200, { categories }, 'Categories fetched');
    })
);

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Create a category (admin only)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               nameInTelugu:
 *                 type: string
 *               description:
 *                 type: string
 *               icon:
 *                 type: string
 *               color:
 *                 type: string
 *               order:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Category created
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 */
// POST /api/categories  (admin only)
router.post(
    '/',
    authenticate,
    authorize('admin', 'super_admin'),
    asyncHandler(async (req, res) => {
        const category = await Category.create(req.body);
        apiResponse(res, 201, { category }, 'Category created');
    })
);

module.exports = router;
