'use strict';

/**
 * mpin.service.js
 *
 * Service layer for MPIN set / login / reset flows.
 * Follows the exact same patterns as auth.service.js:
 *   - Uses AppError for all operational errors
 *   - Reuses _issueTokens via the same generateAccessToken / generateRefreshToken utils
 *   - Interacts only with Mongoose models (User + UserDevice)
 */

const User       = require('../models/User');
const UserDevice = require('../models/UserDevice');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { AppError } = require('../utils/AppError');

// ─── Shared Token Issuer (mirrors auth.service.js) ───────────────────────────

/**
 * Issues a JWT pair with userId, role, and deviceId in the payload.
 */
const _issueTokensWithDevice = (user, deviceId) => {
    const payload = { id: user._id, role: user.role, deviceId };
    return {
        accessToken:  generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
};

// ─── MPIN Setup ──────────────────────────────────────────────────────────────

/**
 * POST /auth/set-mpin
 *
 * Called AFTER the user is authenticated (has a valid JWT from OTP/password login).
 * Registers the device if it is new, then stores a bcrypt hash of the MPIN.
 *
 * @param {string} userId        - from req.user.id (set by authenticate middleware)
 * @param {string} deviceId      - client-supplied device fingerprint
 * @param {string} mpin          - raw 4-6 digit MPIN
 * @param {string} [deviceName]  - optional human-readable label
 * @param {string} [deviceType]  - android | ios | web | other
 */
const setMpin = async ({ userId, deviceId, mpin, deviceName, deviceType }) => {
    // 1. Ensure user exists and is active
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
        throw new AppError('User not found or account is inactive', 404);
    }

    // 2. Validate MPIN format (4-6 digits)
    if (!/^\d{4,6}$/.test(mpin)) {
        throw new AppError('MPIN must be 4 to 6 digits', 400);
    }

    // 3. Upsert device record (one record per userId+deviceId)
    let device = await UserDevice.findOne({ userId, deviceId }).select('+mpinHash');
    if (!device) {
        device = new UserDevice({ userId, deviceId, deviceName, deviceType });
    } else {
        // Allow updating device metadata
        if (deviceName) device.deviceName = deviceName;
        if (deviceType) device.deviceType = deviceType;
    }

    // 4. Hash and persist MPIN
    await device.setMpin(mpin);
    await device.save();

    // 5. Flip convenience flag on User
    if (!user.mpinEnabled) {
        user.mpinEnabled = true;
        await user.save({ validateBeforeSave: false });
    }

    return { message: 'MPIN set successfully for this device' };
};

// ─── MPIN Login ──────────────────────────────────────────────────────────────

/**
 * POST /auth/mpin-login
 *
 * Validates device registration, checks MPIN hash, enforces lockout,
 * then issues a fresh JWT pair.
 *
 * @param {string} identifier  - userId OR mobile number (phone)
 * @param {string} mpin        - raw 4-6 digit MPIN
 * @param {string} deviceId    - device fingerprint (must already be registered)
 */
const mpinLogin = async ({ identifier, mpin, deviceId }) => {
    if (!identifier || !mpin || !deviceId) {
        throw new AppError('identifier, mpin, and deviceId are required', 400);
    }

    // 1. Resolve user — handle UserId (ObjectId), Email (@), or Phone
    let user;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
    const isEmail = identifier.includes('@');

    if (isObjectId) {
        user = await User.findById(identifier);
    } else if (isEmail) {
        user = await User.findOne({ email: identifier.toLowerCase() });
    } else {
        user = await User.findOne({ phone: identifier });
    }

    if (!user) throw new AppError('User not found', 404);
    if (!user.isActive) throw new AppError('Account is disabled. Contact support.', 403);

    // 2. Load the registered device (with MPIN hash)
    const device = await UserDevice.findOne({ userId: user._id, deviceId }).select('+mpinHash');

    if (!device || !device.isActive) {
        throw new AppError('Device not registered. Please set up MPIN from a verified session.', 403);
    }

    if (!device.isMpinSet) {
        throw new AppError('MPIN not set for this device. Please set your MPIN first.', 400);
    }

    // 3. Lockout check
    if (device.isMpinLocked()) {
        const unlockAt = device.mpinLockedUntil.toISOString();
        throw new AppError(
            `Too many failed attempts. Device locked until ${unlockAt}. Please use OTP login.`,
            429
        );
    }

    // 4. Verify MPIN
    const isMatch = await device.compareMpin(mpin);
    if (!isMatch) {
        device.recordMpinFailure();
        await device.save({ validateBeforeSave: false });

        const remaining = Math.max(
            0,
            (parseInt(process.env.VIVA_DIGITAL_MAX_MPIN_ATTEMPTS) || 5) - device.mpinFailedAttempts
        );

        if (device.isMpinLocked()) {
            throw new AppError(
                'Too many failed MPIN attempts. Device is locked. Please use OTP login to reset.',
                429
            );
        }

        throw new AppError(
            `Invalid MPIN. ${remaining} attempt(s) remaining before lockout.`,
            401
        );
    }

    // 5. Success — reset attempts, issue tokens
    device.resetMpinAttempts();
    await device.save({ validateBeforeSave: false });

    const tokens = _issueTokensWithDevice(user, deviceId);

    // 6. Persist refresh token on user (same as auth.service.js)
    user.lastLogin = new Date();
    user.refreshToken = tokens.refreshToken;
    await user.save({ validateBeforeSave: false });

    return {
        ...tokens,
        user: user.toSafeObject(),
        deviceId,
    };
};

// ─── MPIN Reset (via OTP / re-authentication) ─────────────────────────────

/**
 * POST /auth/reset-mpin
 *
 * Resets MPIN for a given device after the user has re-authenticated
 * (authenticated middleware verifies the JWT from OTP/password flow).
 *
 * Optionally supply `oldMpin` to allow self-service reset without
 * a full OTP cycle — if the account is NOT locked.
 *
 * @param {string} userId    - from req.user.id
 * @param {string} deviceId  - device to reset
 * @param {string} newMpin   - new MPIN
 * @param {string} [oldMpin] - optional: verify current MPIN if device is not locked
 */
const resetMpin = async ({ userId, deviceId, newMpin, oldMpin }) => {
    // 1. Verify user
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
        throw new AppError('User not found or account is inactive', 404);
    }

    // 2. Validate new MPIN format
    if (!/^\d{4,6}$/.test(newMpin)) {
        throw new AppError('New MPIN must be 4 to 6 digits', 400);
    }

    // 3. Load device
    const device = await UserDevice.findOne({ userId, deviceId }).select('+mpinHash');
    if (!device || !device.isActive) {
        throw new AppError('Device not registered for this account', 404);
    }

    // 4. (Optional) If oldMpin provided and device is NOT locked → verify it
    if (oldMpin && !device.isMpinLocked()) {
        const isOldCorrect = await device.compareMpin(oldMpin);
        if (!isOldCorrect) {
            throw new AppError('Current MPIN is incorrect', 401);
        }
    }

    // 5. Set new MPIN (clears lockout state)
    await device.setMpin(newMpin);
    await device.save();

    return { message: 'MPIN reset successfully' };
};

// ─── Device Management ───────────────────────────────────────────────────────

/**
 * GET /auth/devices
 * Returns all registered devices for the authenticated user.
 */
const listDevices = async (userId) => {
    const devices = await UserDevice.find({ userId, isActive: true })
        .select('-mpinHash')
        .sort({ lastUsedAt: -1 });

    return { devices };
};

/**
 * DELETE /auth/devices/:deviceId
 * Deregisters (soft-deletes) a device — user must be authenticated.
 */
const removeDevice = async (userId, deviceId) => {
    const device = await UserDevice.findOne({ userId, deviceId });
    if (!device) throw new AppError('Device not found', 404);

    device.isActive = false;
    device.isMpinSet = false;
    device.mpinHash = undefined;
    await device.save({ validateBeforeSave: false });

    // If no more active MPIN devices exist, clear the convenience flag
    const remaining = await UserDevice.countDocuments({ userId, isActive: true, isMpinSet: true });
    if (remaining === 0) {
        await User.findByIdAndUpdate(userId, { mpinEnabled: false });
    }

    return { message: 'Device removed and MPIN cleared' };
};

module.exports = {
    setMpin,
    mpinLogin,
    resetMpin,
    listDevices,
    removeDevice,
};
