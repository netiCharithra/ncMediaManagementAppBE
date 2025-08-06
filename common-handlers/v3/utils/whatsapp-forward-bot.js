const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Configuration
const SOURCE_GROUP_NAME = 'Group A'; // 👈 change this
const TARGET_GROUP_NAMES = ['Group B', 'Group C']; // 👈 change this
const MESSAGE_THROTTLE_MS = 5000; // ⏱ 5 seconds between messages

// Setup logging
const LOG_FILE = path.join(__dirname, 'bot.log');

// Function to write logs to file with timestamp
function logToFile(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
}

// Setup console logging override
function setupLogging() {
    // Override console methods to also log to file
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
        const message = args.join(' ');
        originalLog(...args);
        logToFile(message, 'INFO');
    };

    console.error = (...args) => {
        const message = args.join(' ');
        originalError(...args);
        logToFile(message, 'ERROR');
    };

    console.warn = (...args) => {
        const message = args.join(' ');
        originalWarn(...args);
        logToFile(message, 'WARN');
    };

    // Clear log file on startup
    fs.writeFileSync(LOG_FILE, `=== Bot Started at ${new Date().toISOString()} ===\n`);
    console.log('📝 Logging initialized. Check bot.log for detailed logs.');
}

// Global client variable
let client = null;
let currentQRCode = null;
let currentQRCodeBase64 = null;
let qrCodeTimestamp = null;

// Function to create and setup WhatsApp client
function createClient() {
    const whatsappClient = new Client({
        authStrategy: new LocalAuth()
    });

    whatsappClient.on('qr', async qr => {
        console.log('📱 QR Code generated. Scan with your WhatsApp mobile app:');
        console.log('🔍 QR Code length:', qr ? qr.length : 'null');
        qrcodeTerminal.generate(qr, { small: true });
        
        try {
            console.log('🔄 Starting base64 QR code generation...');
            
            // Generate base64 QR code image
            const qrCodeBase64 = await QRCode.toDataURL(qr, {
                type: 'image/png',
                quality: 0.92,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                width: 256
            });
            
            console.log('✅ Base64 QR code generated successfully, length:', qrCodeBase64 ? qrCodeBase64.length : 'null');
            
            // Store QR code for API access
            currentQRCode = qr;
            currentQRCodeBase64 = qrCodeBase64;
            qrCodeTimestamp = new Date().toISOString();
            
            console.log('💾 QR Code stored for API access:');
            console.log('  - Raw QR length:', currentQRCode ? currentQRCode.length : 'null');
            console.log('  - Base64 QR length:', currentQRCodeBase64 ? currentQRCodeBase64.length : 'null');
            console.log('  - Timestamp:', qrCodeTimestamp);
            
        } catch (error) {
            console.error('❌ Error generating QR code base64:', error);
            console.error('  - Error details:', error.message);
            console.error('  - Error stack:', error.stack);
            
            // Fallback: store raw QR code
            currentQRCode = qr;
            currentQRCodeBase64 = null;
            qrCodeTimestamp = new Date().toISOString();
            
            console.log('🔄 Fallback: stored raw QR code only');
            console.log('  - Raw QR length:', currentQRCode ? currentQRCode.length : 'null');
        }
    });

    whatsappClient.on('ready', () => {
        console.log('✅ WhatsApp Client is ready!');
        // Clear QR code when client is ready
        currentQRCode = null;
        currentQRCodeBase64 = null;
        qrCodeTimestamp = null;
    });

    whatsappClient.on('authenticated', () => {
        console.log('🔐 WhatsApp Client authenticated successfully!');
    });

    whatsappClient.on('auth_failure', (msg) => {
        console.error('❌ Authentication failed:', msg);
    });

    whatsappClient.on('disconnected', (reason) => {
        console.warn('⚠️ WhatsApp Client disconnected:', reason);
    });

    // Message handler
    whatsappClient.on('message', async msg => {
    // Step 1: Get the chat this message came from
    const chat = await msg.getChat();

    // Step 2: Only forward if it's from your source group
    if (chat.isGroup && chat.name === SOURCE_GROUP_NAME) {
        // Check if message has media (image, video, document, etc.)
        const hasMedia = msg.hasMedia;
        const messageType = hasMedia ? `${msg.type} with caption` : 'text';
        
        // Enhanced debugging for media detection
        console.log(`🔍 Message details: type=${msg.type}, hasMedia=${hasMedia}, hasQuotedMsg=${msg.hasQuotedMsg}`);
        console.log(`📨 Forwarding ${messageType} from ${chat.name}: "${msg.body || '[Media without caption]'}"`);

        // Step 3: Get all chats (groups)
        const allChats = await client.getChats();

        // Step 4: Loop through target group names and send message with throttling
        console.log(`🔍 Looking for groups: ${TARGET_GROUP_NAMES.join(', ')}`);
        console.log(`📋 Available groups: ${allChats.filter(c => c.isGroup).map(c => c.name).join(', ')}`);
        
        for (let groupName of TARGET_GROUP_NAMES) {
            const targetChat = allChats.find(c => c.isGroup && c.name === groupName);

            if (targetChat) {
                try {
                    if (hasMedia) {
                        // Handle media messages (images, videos, documents, etc.)
                        console.log(`📎 Downloading ${msg.type} media for ${groupName}...`);
                        const media = await msg.downloadMedia();
                        
                        if (media) {
                            // Create MessageMedia object and send with caption
                            const messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
                            
                            // Send media with caption
                            await targetChat.sendMessage(messageMedia, { caption: msg.body || '' });
                            console.log(`✅ Sent ${msg.type} with caption to ${groupName}`);
                        } else {
                            console.error(`❌ Failed to download media for ${groupName}`);
                        }
                    } else {
                        // Handle text messages
                        await targetChat.sendMessage(msg.body);
                        console.log(`✅ Sent text to ${groupName}`);
                    }
                } catch (err) {
                    console.error(`❌ Failed to send to ${groupName}:`, err.message);
                    // Try alternative method if first fails
                    try {
                        if (hasMedia) {
                            console.log(`🔄 Trying fallback method for media to ${groupName}...`);
                            const media = await msg.downloadMedia();
                            if (media) {
                                const messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
                                await client.sendMessage(targetChat.id._serialized, messageMedia, { caption: msg.body || '' });
                                console.log(`✅ Sent ${msg.type} to ${groupName} (fallback method)`);
                            }
                        } else {
                            await client.sendMessage(targetChat.id._serialized, msg.body);
                            console.log(`✅ Sent text to ${groupName} (fallback method)`);
                        }
                    } catch (fallbackErr) {
                        console.error(`❌ Fallback also failed for ${groupName}:`, fallbackErr.message);
                    }
                }

                // Step 5: Add throttling delay
                await new Promise(resolve => setTimeout(resolve, MESSAGE_THROTTLE_MS));
            } else {
                console.warn(`⚠️ Group not found: ${groupName}`);
            }
        }
    }
    });

    return whatsappClient;
}

// Main function to start the WhatsApp bot
async function startBot() {
    try {
        setupLogging();
        console.log('🚀 Starting WhatsApp Forward Bot...');
        
        if (client) {
            console.log('⚠️ Bot is already running!');
            return client;
        }
        
        client = createClient();
        await client.initialize();
        
        console.log('✅ Bot started successfully!');
        return client;
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        throw error;
    }
}

// Function to stop the bot
async function stopBot() {
    try {
        if (!client) {
            console.log('⚠️ Bot is not running!');
            return;
        }
        
        console.log('🛑 Stopping WhatsApp bot...');
        await client.destroy();
        client = null;
        
        // Clear QR code when stopping
        currentQRCode = null;
        currentQRCodeBase64 = null;
        qrCodeTimestamp = null;
        
        // Clear WhatsApp authentication session data to force fresh authentication
        try {
            const authPath = path.join(__dirname, '.wwebjs_auth');
            console.log('🗑️ Clearing authentication session data at:', authPath);
            
            if (fs.existsSync(authPath)) {
                // Remove the entire authentication directory
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log('✅ Authentication session data cleared successfully');
            } else {
                console.log('📝 No authentication session data found to clear');
            }
        } catch (sessionError) {
            console.error('⚠️ Failed to clear session data (will still force fresh auth):', sessionError.message);
            // Don't throw error here, as the main bot stopping was successful
        }
        
        console.log('✅ Bot stopped successfully and authentication reset!');
    } catch (error) {
        console.error('❌ Failed to stop bot:', error);
        throw error;
    }
}

// Function to get bot status
function getBotStatus() {
    return {
        isRunning: client !== null,
        client: client
    };
}

// Function to get current QR code
function getQRCode() {
    return {
        qrCode: currentQRCode,
        qrCodeBase64: currentQRCodeBase64,
        timestamp: qrCodeTimestamp,
        hasQR: currentQRCode !== null
    };
}

// Function to get detailed QR code status for debugging
function getQRCodeDebugInfo() {
    return {
        qrCode: currentQRCode,
        qrCodeBase64: currentQRCodeBase64,
        timestamp: qrCodeTimestamp,
        hasQR: currentQRCode !== null,
        qrCodeLength: currentQRCode ? currentQRCode.length : 0,
        base64Length: currentQRCodeBase64 ? currentQRCodeBase64.length : 0,
        qrCodeType: typeof currentQRCode,
        base64Type: typeof currentQRCodeBase64
    };
}

// Function to start bot and get QR code
async function startBotAndGetQR() {
    try {
        console.log('🚀 Starting WhatsApp bot for QR code...');
        
        if (client) {
            console.log('⚠️ Bot is already running!');
            // If bot is running but no QR, it might be authenticated
            if (!currentQRCode) {
                return {
                    success: true,
                    message: 'Bot is already running and authenticated',
                    qrCode: null,
                    qrCodeBase64: null,
                    isAuthenticated: true
                };
            }
            return {
                success: true,
                message: 'Bot is running, QR available',
                qrCode: currentQRCode,
                qrCodeBase64: currentQRCodeBase64,
                timestamp: qrCodeTimestamp,
                isAuthenticated: false
            };
        }
        
        // Clear any existing QR code data before starting
        currentQRCode = null;
        currentQRCodeBase64 = null;
        qrCodeTimestamp = null;
        
        // Start the bot
        await startBot();
        
        // Wait for QR code to be generated with polling
        console.log('⏳ Waiting for QR code generation...');
        let attempts = 0;
        const maxAttempts = 15; // 15 seconds max wait
        
        while (attempts < maxAttempts && !currentQRCode) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            attempts++;
            console.log(`🔍 QR code check attempt ${attempts}/${maxAttempts}...`);
        }
        
        if (currentQRCode) {
            console.log('✅ QR code generated successfully!');
            return {
                success: true,
                message: 'Bot started successfully and QR code generated',
                qrCode: currentQRCode,
                qrCodeBase64: currentQRCodeBase64,
                timestamp: qrCodeTimestamp,
                isAuthenticated: false
            };
        } else {
            console.log('⚠️ QR code not generated within timeout, but bot may be authenticated');
            return {
                success: true,
                message: 'Bot started but QR code not generated (may be already authenticated)',
                qrCode: null,
                qrCodeBase64: null,
                timestamp: null,
                isAuthenticated: true
            };
        }
    } catch (error) {
        console.error('❌ Failed to start bot for QR:', error);
        return {
            success: false,
            message: 'Failed to start bot',
            error: error.message,
            qrCode: null
        };
    }
}

// Export functions for use as module
module.exports = {
    startBot,
    stopBot,
    getBotStatus,
    getQRCode,
    getQRCodeDebugInfo,
    startBotAndGetQR,
    SOURCE_GROUP_NAME,
    TARGET_GROUP_NAMES,
    MESSAGE_THROTTLE_MS
};

// If this file is run directly (not imported), start the bot
if (require.main === module) {
    startBot().catch(console.error);
}
