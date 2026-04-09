'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * UserDevice — stores one MPIN per device per user.
 *
 * A single user can have N devices. Each device:
 *   - must be explicitly registered before MPIN login is allowed
 *   - carries its own MPIN hash so the user can set different MPINs per device
 *   - tracks failed login attempts for lockout logic
 */
const userDeviceSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        deviceId: {
            type: String,
            required: [true, 'Device ID is required'],
            trim: true,
        },
        deviceName: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        deviceType: {
            type: String,
            enum: ['android', 'ios', 'web', 'other'],
            default: 'other',
        },

        // ── MPIN ────────────────────────────────────────────────────────────────
        mpinHash: {
            type: String,
            select: false,        // Never returned in queries by default
        },
        isMpinSet: {
            type: Boolean,
            default: false,
        },

        // ── Brute-force / Lockout ────────────────────────────────────────────
        mpinFailedAttempts: {
            type: Number,
            default: 0,
        },
        mpinLockedUntil: {
            type: Date,
            default: null,
        },

        // ── Lifecycle ────────────────────────────────────────────────────────
        isActive: {
            type: Boolean,
            default: true,
        },
        lastUsedAt: {
            type: Date,
        },
        registeredAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

// Compound unique index: one record per (user, device)
userDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

// ── MPIN helpers ────────────────────────────────────────────────────────────────

/**
 * Hash and store a new MPIN.
 */
userDeviceSchema.methods.setMpin = async function (plainMpin) {
    this.mpinHash = await bcrypt.hash(plainMpin, 12);
    this.isMpinSet = true;
    // Reset lockout on MPIN change
    this.mpinFailedAttempts = 0;
    this.mpinLockedUntil = null;
};

/**
 * Compare a candidate MPIN against the stored hash.
 */
userDeviceSchema.methods.compareMpin = async function (candidateMpin) {
    if (!this.mpinHash) return false;
    return bcrypt.compare(candidateMpin, this.mpinHash);
};

/**
 * Returns true if the device is currently locked out.
 */
userDeviceSchema.methods.isMpinLocked = function () {
    return this.mpinLockedUntil && this.mpinLockedUntil > new Date();
};

/**
 * Record a failed MPIN attempt.
 * Locks the device for MPIN_LOCK_MINUTES (default 30) after MAX_MPIN_ATTEMPTS failures.
 */
const MAX_MPIN_ATTEMPTS = parseInt(process.env.MAX_MPIN_ATTEMPTS) || 5;
const MPIN_LOCK_MINUTES = parseInt(process.env.MPIN_LOCK_MINUTES) || 30;

userDeviceSchema.methods.recordMpinFailure = function () {
    this.mpinFailedAttempts += 1;
    if (this.mpinFailedAttempts >= MAX_MPIN_ATTEMPTS) {
        this.mpinLockedUntil = new Date(Date.now() + MPIN_LOCK_MINUTES * 60 * 1000);
    }
};

/**
 * Reset failed attempt counter on successful login.
 */
userDeviceSchema.methods.resetMpinAttempts = function () {
    this.mpinFailedAttempts = 0;
    this.mpinLockedUntil = null;
    this.lastUsedAt = new Date();
};

module.exports = mongoose.model('UserDevice', userDeviceSchema);
