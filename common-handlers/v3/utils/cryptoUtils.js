const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
// Hardcoded 32-byte hex key as requested
// const HEX_KEY = '7af35bce04bd4d60d3a70968e96c76a1818bbd1a235843ad1a00366534a4a102';
const HEX_KEY = process.env.HEX_KEY_ENCRYPT_DECRYPT;
const KEY = Buffer.from(HEX_KEY, 'hex');

/**
 * Encrypts a string or object into a dot-separated Base64 string: iv.tag.ciphertext
 * @param {string|object} text - The data to encrypt
 * @returns {string} The encrypted dot-separated string
 */
function encrypt(text) {
    const dataString = typeof text === 'string' ? text : JSON.stringify(text);

    // GCM standard IV size is 12 bytes
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    let encrypted = cipher.update(dataString, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tag = cipher.getAuthTag().toString('base64');
    const ivBase64 = iv.toString('base64');

    return `${ivBase64}.${tag}.${encrypted}`;
}

/**
 * Decrypts a dot-separated Base64 string (iv.tag.ciphertext)
 * @param {string} encryptedString - The string to decrypt
 * @returns {string} The decrypted data string
 */
function decrypt(encryptedString) {
    const parts = encryptedString.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted format. Expected iv.tag.ciphertext');
    }

    const [ivBase64, tagBase64, ciphertextBase64] = parts;

    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertextBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

module.exports = {
    encrypt,
    decrypt
};
