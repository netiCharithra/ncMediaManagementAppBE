'use strict';

const { getFirebaseMessaging } = require('../config/firebase');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

/**
 * Send a push notification via FCM.
 * Supports topic-based (all / district / state) delivery.
 */
const sendNotification = async ({ title, body, type, newsId, imageUrl, targetAudience, targetDistrict, targetState, sentBy }) => {
    // Save notification record first
    const notification = await Notification.create({
        title,
        body,
        type,
        newsId: newsId || null,
        imageUrl,
        targetAudience,
        targetDistrict,
        targetState,
        sentBy,
        status: 'pending',
    });

    try {
        const messaging = getFirebaseMessaging();

        // Build FCM topic or condition
        let topic;
        let condition;

        if (targetAudience === 'all') {
            topic = 'all_users';
        } else if (targetAudience === 'district' && targetDistrict) {
            topic = `district_${targetDistrict.toLowerCase().replace(/\s+/g, '_')}`;
        } else if (targetAudience === 'state' && targetState) {
            topic = `state_${targetState.toLowerCase().replace(/\s+/g, '_')}`;
        } else if (targetAudience === 'national') {
            topic = 'national_news';
        } else {
            topic = 'all_users';
        }

        const message = {
            notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
            data: {
                type,
                newsId: newsId ? newsId.toString() : '',
                clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            },
            topic,
            android: {
                notification: {
                    channelId: 'viva_news_channel',
                    priority: type === 'breaking' ? 'high' : 'normal',
                    sound: 'default',
                },
            },
            apns: {
                payload: { aps: { sound: 'default', badge: 1 } },
            },
        };

        const response = await messaging.send(message);
        logger.info(`FCM notification sent: ${response}`);

        notification.status = 'sent';
        notification.sentAt = new Date();
        notification.fcmTopic = topic;
        await notification.save();

        return { success: true, messageId: response, notificationId: notification._id };
    } catch (err) {
        logger.error('FCM send error:', err);
        notification.status = 'failed';
        notification.errorMessage = err.message;
        await notification.save();
        throw new AppError('Failed to send push notification', 500);
    }
};

/**
 * Register/update FCM token for a user.
 */
const registerFcmToken = async (userId, token) => {
    await User.findByIdAndUpdate(userId, { $addToSet: { fcmTokens: token } });
    // Subscribe to default topic
    try {
        const messaging = getFirebaseMessaging();
        await messaging.subscribeToTopic([token], 'all_users');
    } catch (err) {
        logger.warn('FCM topic subscription failed:', err.message);
    }
};

/**
 * Subscribe a token to a district topic.
 */
const subscribeToDistrict = async (token, district) => {
    try {
        const messaging = getFirebaseMessaging();
        const topic = `district_${district.toLowerCase().replace(/\s+/g, '_')}`;
        await messaging.subscribeToTopic([token], topic);
    } catch (err) {
        logger.warn('District FCM subscription failed:', err.message);
    }
};

/**
 * Get notification history with pagination.
 */
const getNotificationHistory = async ({ page = 1, limit = 20 } = {}) => {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
        Notification.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('sentBy', 'name email')
            .lean(),
        Notification.countDocuments(),
    ]);
    return { notifications, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

module.exports = { sendNotification, registerFcmToken, subscribeToDistrict, getNotificationHistory };
