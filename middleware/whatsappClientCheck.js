const { getBotStatus, startBot } = require('../common-handlers/v3/utils/whatsapp-forward-bot');

/**
 * Middleware to ensure WhatsApp client is running before admin API calls
 * If client is not running, it will automatically start it using startBot
 */
const ensureWhatsAppClientRunning = async (req, res, next) => {
    try {
        console.log('🔍 Checking WhatsApp client status...');
        
        const status = getBotStatus();
        
        if (!status.isRunning) {
            console.log('⚠️ WhatsApp client is not running. Starting client...');
            
            try {
                // startBot() handles both client creation and initialization
                await startBot();
                console.log('✅ WhatsApp client started successfully');
            } catch (error) {
                console.error('❌ Failed to start WhatsApp client:', error);
                // Continue with the request even if WhatsApp client fails to start
                // This prevents admin APIs from being blocked due to WhatsApp issues
                console.warn('⚠️ Continuing with admin API request despite WhatsApp client failure');
            }
        } else {
            console.log('✅ WhatsApp client is already running');
        }
        
        // Continue to the next middleware/route handler
        next();
    } catch (error) {
        console.error('❌ Error in WhatsApp client check middleware:', error);
        // Continue with the request even if there's an error in the middleware
        // This ensures admin functionality is not blocked by WhatsApp issues
        next();
    }
};

module.exports = ensureWhatsAppClientRunning;
