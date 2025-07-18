const express = require('express');
const router = express.Router();
const { sendOTP, verifyOTPAndLogin } = require('./otpController');

/**
 * @swagger
 * /public/login/send-otp:
 *   post:
 *     summary: Request an OTP for login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: User's email, mobile number, or employee ID
 *     responses:
 *       200:
 *         description: OTP generated successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.route('/public/login/send-otp').post(sendOTP);

/**
 * @swagger
 * /public/login/verify-otp:
 *   post:
 *     summary: Verify OTP and login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - otp
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: The same identifier used to request the OTP
 *               otp:
 *                 type: string
 *                 description: The OTP received by the user
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid or expired OTP
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.route('/public/login/verify-otp').post(verifyOTPAndLogin);

module.exports = router;
