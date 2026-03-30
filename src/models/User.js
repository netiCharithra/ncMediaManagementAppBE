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
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        phone: {
            type: String,
            unique: true,
            sparse: true,
            match: [/^[6-9]\d{9}$/, 'Please provide a valid Indian mobile number'],
        },
        googleId: { type: String, unique: true, sparse: true },
        avatar: { type: String },
        password: {
            type: String,
            minlength: 6,
            select: false,
        },
        role: {
            type: String,
            enum: ['user'],
            default: 'user',
        },
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
    },
    { timestamps: true }
);

userSchema.index({ 'location.coordinates': '2dsphere' });

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.refreshToken;
    delete obj.fcmTokens;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
