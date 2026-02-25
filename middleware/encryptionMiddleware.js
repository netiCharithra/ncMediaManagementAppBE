const { encrypt, decrypt } = require('../common-handlers/v3/utils/cryptoUtils');

/**
 * Express Middleware to automatically decrypt requests and encrypt responses
 * for /v3/ routes.
 */
function encryptionMiddleware(req, res, next) {
    // Only apply to /v3/ routes (or pass through if mounted directly)
    if (req.originalUrl && !req.originalUrl.includes('/v3/')) {
        return next();
    }

    // 1. Decrypt incoming request body
    if (req.body) {
        try {
            let decryptedString = null;

            // Check if req.body is exactly a string
            if (typeof req.body === 'string') {
                decryptedString = decrypt(req.body);
            }
            // Also handle cases where a JSON parser middleware placed it in req.body.payload
            else if (typeof req.body === 'object' && typeof req.body.payload === 'string') {
                decryptedString = decrypt(req.body.payload);
            }

            if (decryptedString) {
                // Parse the decrypted string back into an object
                req.body = JSON.parse(decryptedString);
            }
        } catch (error) {
            // Ensure error handling so that if decryption fails, the API returns a 400 error
            return res.status(400).json({ error: 'Decryption failed or invalid encrypted payload format.' });
        }
    }

    // 2. Wrap res.json to automatically encrypt the response body
    const originalJson = res.json;
    res.json = function (body) {
        // Avoid double-encrypting if already in the right format (e.g., error responses mapped here)
        if (
            body &&
            typeof body === 'object' &&
            body.payload &&
            typeof body.payload === 'string' &&
            body.payload.split('.').length === 3 &&
            Object.keys(body).length === 1
        ) {
            return originalJson.call(this, body);
        }

        try {
            // Encrypt the JSON response and format it as { payload: 'iv.tag.ciphertext' }
            const encryptedBodyString = encrypt(body);
            return originalJson.call(this, { payload: encryptedBodyString });
        } catch (encryptionError) {
            console.error('Response encryption error:', encryptionError);
            return originalJson.call(this, { error: 'Internal server error during encryption.' });
        }
    };

    next();
}

module.exports = encryptionMiddleware;
