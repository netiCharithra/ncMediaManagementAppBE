'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Notification title is required'],
            trim: true,
            maxlength: 100,
        },
        body: {
            type: String,
            required: [true, 'Notification body is required'],
            maxlength: 500,
        },
        type: {
            type: String,
            enum: ['breaking', 'trending', 'local', 'general', 'promotional'],
            default: 'general',
            index: true,
        },
        newsId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'News',
            default: null,
        },
        imageUrl: { type: String },
        targetAudience: {
            type: String,
            enum: ['all', 'district', 'state', 'national'],
            default: 'all',
        },
        targetDistrict: { type: String },
        targetState: { type: String },

        // FCM delivery info
        fcmTopic: { type: String },
        fcmCondition: { type: String },
        sentTo: { type: Number, default: 0 }, // number of devices
        deliveredTo: { type: Number, default: 0 },
        failedDeliveries: { type: Number, default: 0 },

        status: {
            type: String,
            enum: ['pending', 'sent', 'failed'],
            default: 'pending',
            index: true,
        },
        sentAt: { type: Date },
        sentBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        errorMessage: { type: String },
    },
    { timestamps: true }
);

notificationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
