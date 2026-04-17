'use strict';

const router = require('express').Router();
const {
    registerColabUrl,
    getColabUrl,
    registerColabUrlValidators,
} = require('../controllers/colab.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// ─── Shared Guard ─────────────────────────────────────────────────────────────
// Only super_admin and admin can READ the active session URL.
// The WRITE endpoint is intentionally open (no JWT) because Colab can't
// easily manage auth tokens — we secure it via the VIVA_DIGITAL_COLAB_SECRET
// header check inside the controller instead.
const isAdmin = [authenticate, authorize('admin', 'super_admin', 'editor')];

/**
 * @swagger
 * tags:
 *   name: Colab
 *   description: Google Colab ↔ backend ngrok tunnel management
 */

/**
 * @swagger
 * /api/colab_ngrok:
 *   post:
 *     summary: Register the latest Colab ngrok public URL
 *     description: |
 *       Called automatically from the Colab notebook every time the ngrok
 *       tunnel URL changes. Performs an upsert so only one active session
 *       document exists in MongoDB at all times.
 *
 *       **Python snippet (Colab side)**
 *       ```python
 *       import requests
 *       requests.post(
 *           "https://api.neticharithra.com/viva-digital-news/api/colab_ngrok",
 *           json={"url": public_url}
 *       )
 *       ```
 *     tags: [Colab]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: "https://e1a2-34-83-200-99.ngrok-free.app"
 *               notebookName:
 *                 type: string
 *                 example: "ViVaDigitalNews Image Worker"
 *     responses:
 *       200:
 *         description: URL registered / updated successfully
 *       422:
 *         description: Validation error — url is missing or not a valid HTTPS URL
 */
router.post('/', registerColabUrlValidators, registerColabUrl);

/**
 * @swagger
 * /api/colab_ngrok:
 *   get:
 *     summary: Get the current active Colab ngrok session URL
 *     description: Returns the most-recently registered ngrok URL. Requires admin auth.
 *     tags: [Colab]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active session returned
 *       404:
 *         description: No session has been registered yet
 *       401:
 *         description: Unauthorized
 */
router.get('/', isAdmin, getColabUrl);

module.exports = router;
