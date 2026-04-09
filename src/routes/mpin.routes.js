'use strict';

/**
 * mpin.routes.js
 *
 * All MPIN-related routes under /api/auth/.
 * Follows the same route structure as auth.routes.js:
 *   - express-validator for input validation
 *   - validate middleware to short-circuit bad input
 *   - authenticate middleware for protected endpoints
 *   - Dedicated rate limiter stricter than the global one
 */

const router          = require('express').Router();
const { body, param } = require('express-validator');
const rateLimit       = require('express-rate-limit');

const mpinController      = require('../controllers/mpin.controller');
const { authenticate }    = require('../middlewares/auth.middleware');
const { validate }        = require('../middlewares/validate.middleware');

// ─── Rate Limiter: MPIN Login ──────────────────────────────────────────────
// Much stricter than the global limiter (app.js uses 100 req / 15 min).
// Here: 10 attempts per 15 min per IP — guards the login brute-force path.
// Per-device lockout (up to 5 attempts) is handled inside the service layer.
const mpinLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many MPIN login attempts from this IP. Please try again after 15 minutes.',
    },
});

// ─── Rate Limiter: MPIN Set / Reset ───────────────────────────────────────
const mpinWriteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hour
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many MPIN change requests. Please try again after an hour.',
    },
});

// ─── Validators ────────────────────────────────────────────────────────────

const mpinFieldValidator = (field = 'mpin') =>
    body(field)
        .isString()
        .matches(/^\d{4,6}$/)
        .withMessage(`${field} must be 4 to 6 digits`);

const deviceIdValidator = body('deviceId')
    .trim()
    .notEmpty()
    .withMessage('deviceId is required');

// ─── Routes ────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/set-mpin
 * Protected: requires valid JWT (authenticate)
 * Sets/updates a device-bound MPIN for the authenticated user.
 */
router.post(
    '/set-mpin',
    authenticate,
    mpinWriteLimiter,
    [
        deviceIdValidator,
        mpinFieldValidator('mpin'),
        body('deviceName').optional().trim().isLength({ max: 100 }),
        body('deviceType').optional().isIn(['android', 'ios', 'web', 'other']),
    ],
    validate,
    mpinController.setMpin
);

/**
 * POST /api/auth/mpin-login
 * Public: no JWT required (this IS the login)
 * Accepts userId or phone number as identifier.
 */
router.post(
    '/mpin-login',
    mpinLoginLimiter,
    [
        body('identifier')
            .trim()
            .notEmpty()
            .withMessage('identifier (userId or phone) is required'),
        deviceIdValidator,
        mpinFieldValidator('mpin'),
    ],
    validate,
    mpinController.mpinLogin
);

/**
 * POST /api/auth/reset-mpin
 * Protected: requires valid JWT (from OTP/password re-auth)
 * Resets the MPIN for a specific device.
 */
router.post(
    '/reset-mpin',
    authenticate,
    mpinWriteLimiter,
    [
        deviceIdValidator,
        mpinFieldValidator('newMpin'),
        body('oldMpin')
            .optional()
            .isString()
            .matches(/^\d{4,6}$/)
            .withMessage('oldMpin must be 4 to 6 digits'),
    ],
    validate,
    mpinController.resetMpin
);

/**
 * GET /api/auth/devices
 * Protected: returns all registered devices for the authenticated user.
 */
router.get('/devices', authenticate, mpinController.listDevices);

/**
 * DELETE /api/auth/devices/:deviceId
 * Protected: deregisters a device and clears its MPIN.
 */
router.delete(
    '/devices/:deviceId',
    authenticate,
    [
        param('deviceId').trim().notEmpty().withMessage('deviceId param is required'),
    ],
    validate,
    mpinController.removeDevice
);

module.exports = router;
