'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        email: {
            type: String,
            unique: true,
            sparse: true, // Making sparse so users can login via mobile only if they prefer
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        phone: {
            type: String,
            required: [true, 'Mobile number is required'],
            unique: true,
            match: [/^[6-9]\d{9}$/, 'Please provide a valid Indian mobile number'],
        },
        password: {
            type: String,
            minlength: 6,
            select: false,
        },
        role: {
            type: String,
            enum: ['user', 'contributor', 'admin', 'super_admin', 'editor'],
            default: 'user',
        },

        // --- ADMIN / EDITOR Specific Fields ---
        permissions: {
            manageNews: { type: Boolean, default: true },
            approveNews: { type: Boolean, default: true },
            bulkPublish: { type: Boolean, default: false },
            manageUsers: { type: Boolean, default: false },
            manageContributors: { type: Boolean, default: false },
            sendNotifications: { type: Boolean, default: false },
            viewAnalytics: { type: Boolean, default: true },
        },

        // --- CONTRIBUTOR Specific Fields ---
        bio: { type: String, maxlength: 500 },
        coveringDistricts: [{ type: String }],
        coveringState: { type: String, default: 'Andhra Pradesh' },
        specialization: [{ type: String }],
        stats: {
            totalSubmissions: { type: Number, default: 0 },
            approved: { type: Number, default: 0 },
            rejected: { type: Number, default: 0 },
            pending: { type: Number, default: 0 },
        },
        contributorStatus: {
            type: String,
            enum: ['pending', 'approved', 'suspended'],
            default: 'pending',
        },

        // --- USER & COMMON Fields ---
        googleId: { type: String, unique: true, sparse: true },
        avatar: { type: String }, // Used as profile image for all roles
        preferredLanguage: {
            type: String,
            enum: ['te', 'hi', 'en'],
            default: 'te',
        },
        location: {
            district: { type: String, trim: true },
            state: { type: String, trim: true, default: 'Andhra Pradesh' },
            coordinates: {
                type: { type: String, enum: ['Point'], default: 'Point' },
                coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
            },
        },
        fcmTokens: [{ type: String }],
        notificationPreferences: {
            breakingNews: { type: Boolean, default: true },
            localNews: { type: Boolean, default: true },
            trending: { type: Boolean, default: true },
        },
        isActive: { type: Boolean, default: true },
        isEmailVerified: { type: Boolean, default: false },
        refreshToken: { type: String, select: false },
        lastLogin: { type: Date },
        // Convenience flag — true when user has MPIN set on ≥1 device.
        // The actual MPIN hash is stored in UserDevice (never here).
        mpinEnabled: { type: Boolean, default: false },
    },
    { timestamps: true }
);

userSchema.index({ 'location.coordinates': '2dsphere' });
userSchema.index({ role: 1 });

userSchema.pre('save', async function (next) {
    // Hash password if modified
    if (this.isModified('password') && this.password) {
        this.password = await bcrypt.hash(this.password, 12);
    }

    // Hash refreshToken if modified and it has a value (don't hash null/empty)
    if (this.isModified('refreshToken') && this.refreshToken) {
        this.refreshToken = await bcrypt.hash(this.refreshToken, 10);
    }

    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Compare a candidate refresh token against its hash.
 */
userSchema.methods.compareRefreshToken = async function (candidateToken) {
    if (!this.refreshToken) return false;
    return bcrypt.compare(candidateToken, this.refreshToken);
};

userSchema.methods.toSafeObject = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.refreshToken;
    delete obj.fcmTokens;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
