'use strict';

const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { apiResponse } = require('../utils/helpers');

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
    const result = await authService.registerUser(req.body);
    apiResponse(res, 201, result, 'Registration successful');
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
    const result = await authService.loginUser(req.body);
    apiResponse(res, 200, result, 'Login successful');
});

// POST /api/auth/google
const loginGoogle = asyncHandler(async (req, res) => {
    const result = await authService.loginGoogle(req.body);
    apiResponse(res, 200, result, 'Google login successful');
});

// POST /api/auth/refresh
const refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken, role } = req.body;
    const result = await authService.refreshAccessToken(refreshToken, role || 'user');
    apiResponse(res, 200, result, 'Token refreshed');
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
    const User = require('../models/User');
    const user = await User.findById(req.user.id).lean();
    apiResponse(res, 200, { user }, 'Profile fetched');
});

// POST /api/auth/fcm-token
const updateFcmToken = asyncHandler(async (req, res) => {
    const { registerFcmToken, subscribeToDistrict } = require('../services/notification.service');
    const { fcmToken, district } = req.body;
    await registerFcmToken(req.user.id, fcmToken);
    if (district) await subscribeToDistrict(fcmToken, district);
    apiResponse(res, 200, {}, 'FCM token registered');
});

module.exports = { register, login, loginGoogle, refreshToken, getMe, updateFcmToken };
