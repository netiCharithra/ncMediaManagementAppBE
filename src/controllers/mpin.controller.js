'use strict';

/**
 * mpin.controller.js
 *
 * Thin controller layer — mirrors auth.controller.js style:
 *   - Delegates all logic to mpin.service.js
 *   - Uses asyncHandler + apiResponse helpers
 */

const mpinService  = require('../services/mpin.service');
const asyncHandler = require('../utils/asyncHandler');
const { apiResponse } = require('../utils/helpers');

// ─── POST /api/auth/set-mpin ─────────────────────────────────────────────────
const setMpin = asyncHandler(async (req, res) => {
    const { deviceId, mpin, deviceName, deviceType } = req.body;
    // userId comes from the authenticated JWT (authenticate middleware)
    const result = await mpinService.setMpin({
        userId: req.user.id,
        deviceId,
        mpin,
        deviceName,
        deviceType,
    });
    apiResponse(res, 200, result, 'MPIN set successfully');
});

// ─── POST /api/auth/mpin-login ───────────────────────────────────────────────
const mpinLogin = asyncHandler(async (req, res) => {
    const { identifier, mpin, deviceId } = req.body;
    const result = await mpinService.mpinLogin({ identifier, mpin, deviceId });
    apiResponse(res, 200, result, 'MPIN login successful');
});

// ─── POST /api/auth/reset-mpin ───────────────────────────────────────────────
const resetMpin = asyncHandler(async (req, res) => {
    const { deviceId, newMpin, oldMpin } = req.body;
    const result = await mpinService.resetMpin({
        userId: req.user.id,
        deviceId,
        newMpin,
        oldMpin,
    });
    apiResponse(res, 200, result, 'MPIN reset successfully');
});

// ─── GET /api/auth/devices ───────────────────────────────────────────────────
const listDevices = asyncHandler(async (req, res) => {
    const result = await mpinService.listDevices(req.user.id);
    apiResponse(res, 200, result, 'Devices fetched');
});

// ─── DELETE /api/auth/devices/:deviceId ─────────────────────────────────────
const removeDevice = asyncHandler(async (req, res) => {
    const { deviceId } = req.params;
    const result = await mpinService.removeDevice(req.user.id, deviceId);
    apiResponse(res, 200, result, 'Device removed');
});

module.exports = { setMpin, mpinLogin, resetMpin, listDevices, removeDevice };
