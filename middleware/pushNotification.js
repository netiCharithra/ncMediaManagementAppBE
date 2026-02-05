const admin = require('firebase-admin');
const MobileUser = require('../modals/mobileUserSchema');
const errorLogBookSchema = require('../modals/errorLogBookSchema');

const sendPushNotificationToAllUsers = async (newsData) => {
    try {
        const fcmTokens = await MobileUser.find({}, { fcmToken: 1, _id: 0 });
        
        if (fcmTokens && fcmTokens.length > 0) {
            const tokens = fcmTokens.map(user => user.fcmToken).filter(token => token);

            if (tokens.length > 0) {
                const message = {
                    notification: {
                        title: 'New News Published',
                        body: newsData?.title || 'A new article has been published. Check it out!'
                    },
                    data: {
                        newsId: String(newsData?.newsId || ''),
                        type: 'news_approved',
                        timestamp: String(new Date().getTime())
                    }
                };

                const batchSize = 500;
                for (let i = 0; i < tokens.length; i += batchSize) {
                    const batch = tokens.slice(i, i + batchSize);
                    
                    try {
                        const response = await admin.messaging().sendEachForMulticast({
                            tokens: batch,
                            notification: message.notification,
                            data: message.data
                        });

                        console.log(`Successfully sent notifications to batch ${Math.floor(i / batchSize) + 1}:`, response.successCount, 'success,', response.failureCount, 'failures');
                        
                        if (response.failureCount > 0) {
                            response.responses.forEach((resp, idx) => {
                                if (!resp.success) {
                                    console.error(`Failed to send to token ${batch[idx]}:`, resp.error);
                                }
                            });
                        }
                    } catch (error) {
                        console.error(`Error sending notification batch ${Math.floor(i / batchSize) + 1}:`, error);
                        await errorLogBookSchema.create({
                            message: `Error sending push notification batch`,
                            stackTrace: JSON.stringify(error.stack || ''),
                            page: 'Push Notification Middleware',
                            functionality: 'Send news approval notification',
                            errorMessage: JSON.stringify(error.message || error)
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in push notification function:', error);
        await errorLogBookSchema.create({
            message: `Error in push notification function`,
            stackTrace: JSON.stringify(error.stack || ''),
            page: 'Push Notification Middleware',
            functionality: 'Send news approval notification',
            errorMessage: JSON.stringify(error.message || error)
        });
    }
};

module.exports = { sendPushNotificationToAllUsers };
