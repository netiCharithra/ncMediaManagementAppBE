'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const contributorSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            unique: true,
            sparse: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            select: false,
        },
        role: {
            type: String,
            enum: ['contributor'],
            default: 'contributor',
        },
        bio: { type: String, maxlength: 500 },
        profileImage: { type: String },
        coveringDistricts: [{ type: String }],
        coveringState: { type: String, default: 'Andhra Pradesh' },
        specialization: [{ type: String }], // e.g., ['politics', 'sports']
        stats: {
            totalSubmissions: { type: Number, default: 0 },
            approved: { type: Number, default: 0 },
            rejected: { type: Number, default: 0 },
            pending: { type: Number, default: 0 },
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'suspended'],
            default: 'pending',
        },
        isActive: { type: Boolean, default: true },
        refreshToken: { type: String, select: false },
        lastLogin: { type: Date },
    },
    { timestamps: true }
);

contributorSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

contributorSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Contributor', contributorSchema);
