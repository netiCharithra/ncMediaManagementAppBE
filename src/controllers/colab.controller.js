'use strict';

const { body, validationResult } = require('express-validator');
const ColabSession = require('../models/ColabSession');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/AppError');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── Validation Rules ─────────────────────────────────────────────────────────

/**
 * Validate that the request body contains a proper HTTPS URL.
 * Exported so the route file can attach these as inline validators.
 */
const registerColabUrlValidators = [
    body('url')
        .trim()
        .notEmpty().withMessage('url is required')
        .isURL({ protocols: ['https'], require_protocol: true })
        .withMessage('url must be a valid HTTPS URL (ngrok gives HTTPS by default)'),

    body('notebookName')
        .optional()
        .isString()
        .isLength({ max: 120 })
        .withMessage('notebookName must be a string of at most 120 characters'),
];

// ─── POST /api/colab_ngrok ────────────────────────────────────────────────────

/**
 * Upsert the latest Colab ngrok URL into MongoDB.
 * Uses findOneAndUpdate with upsert:true so only a single document
 * (keepAliveKey = "singleton") ever lives in the collection.
 *
 * Called from Colab via:
 *   requests.post("https://…/api/colab_ngrok", json={"url": public_url})
 */
const registerColabUrl = asyncHandler(async (req, res) => {
    // Run validation result check (validators are applied on the route)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 422);
    }

    const { url, notebookName } = req.body;

    const session = await ColabSession.findOneAndUpdate(
        { keepAliveKey: 'singleton' },
        {
            $set: {
                url,
                lastSeenAt: new Date(),
                ...(notebookName !== undefined ? { notebookName } : {}),
            },
        },
        {
            upsert: true,       // Create document if it doesn't exist yet
            new: true,          // Return the document after update
            runValidators: true,
            setDefaultsOnInsert: true,
        }
    );

    logger.infoEvent('colab.session.registered', {
        component: 'ColabSession',
        url,
        notebookName: session.notebookName,
        sessionId: String(session._id),
    });

    apiResponse(res, 200, { session }, 'Colab ngrok URL registered successfully');
});

// ─── GET /api/colab_ngrok ─────────────────────────────────────────────────────

/**
 * Retrieve the current active Colab session URL.
 * Useful for admin dashboards or other services that need to call the
 * Colab inference endpoint without hard-coding its URL.
 */
const getColabUrl = asyncHandler(async (_req, res) => {
    const session = await ColabSession.findOne({ keepAliveKey: 'singleton' }).lean();

    if (!session) {
        throw new AppError('No active Colab session registered yet.', 404);
    }

    apiResponse(res, 200, { session }, 'Active Colab session fetched');
});

module.exports = { registerColabUrl, getColabUrl, registerColabUrlValidators };
