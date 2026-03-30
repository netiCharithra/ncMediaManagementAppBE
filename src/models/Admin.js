'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema(
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
        password: {
            type: String,
            required: [true, 'Password is required'],
            select: false,
        },
        role: {
            type: String,
            enum: ['admin', 'super_admin', 'editor'],
            default: 'admin',
        },
        permissions: {
            manageNews: { type: Boolean, default: true },
            approveNews: { type: Boolean, default: true },   // Can approve/publish individual news
            bulkPublish: { type: Boolean, default: false },  // Can bulk-approve translated news
            manageUsers: { type: Boolean, default: false },
            manageContributors: { type: Boolean, default: false },
            sendNotifications: { type: Boolean, default: false },
            viewAnalytics: { type: Boolean, default: true },
        },
        isActive: { type: Boolean, default: true },
        lastLogin: { type: Date },
        refreshToken: { type: String, select: false },
    },
    { timestamps: true }
);

adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

adminSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
