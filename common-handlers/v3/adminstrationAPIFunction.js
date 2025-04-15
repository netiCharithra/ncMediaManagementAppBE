const metaDataSchema = require('../../modals/metaDataSchema');
const { getFileTempUrls3 } = require('./../commonApiFunction');
const reportersSchema = require('../../modals/reportersSchema');
const CryptoJS = require('crypto-js');
const errorLogBookSchema = require('../../modals/errorLogBookSchema');
require('dotenv').config();

// Encryption configuration
const SECRET_SALT = 'NC_MEDIA_SALT_2025@#$%';
const KEY_SIZE = 256;
const ITERATIONS = 1000;

// Encryption utility functions
const encrypt = (data) => {
    try {
        // Generate random IV
        const iv = CryptoJS.lib.WordArray.random(16);

        // Generate key using PBKDF2
        const key = CryptoJS.PBKDF2(SECRET_SALT, iv, {
            keySize: KEY_SIZE / 32,
            iterations: ITERATIONS
        });

        // Encrypt
        const encrypted = CryptoJS.AES.encrypt(data, key, {
            iv: iv,
            padding: CryptoJS.pad.Pkcs7,
            mode: CryptoJS.mode.CBC
        });

        // Combine IV and encrypted data
        const combined = CryptoJS.lib.WordArray.create()
            .concat(iv)
            .concat(encrypted.ciphertext);

        // Convert to base64
        return combined.toString(CryptoJS.enc.Base64);
    } catch (error) {
        console.error('Encryption error:', error);
        return '';
    }
};

const encryptObject = (obj) => {
    try {
        const jsonStr = JSON.stringify(obj);
        return encrypt(jsonStr);
    } catch (error) {
        console.error('Object encryption error:', error);
        return '';
    }
};

// Decryption utility functions
const decrypt = (encrypted) => {
    try {
        console.log("Attempting to decrypt:", encrypted);
        // Convert from base64
        const ciphertext = CryptoJS.enc.Base64.parse(encrypted);
        console.log("Parsed base64 ciphertext");
        
        // Extract IV and data
        const iv = CryptoJS.lib.WordArray.create(ciphertext.words.slice(0, 4));
        const encryptedData = CryptoJS.lib.WordArray.create(ciphertext.words.slice(4));
        console.log("Extracted IV and data");

        // Generate key using PBKDF2
        const key = CryptoJS.PBKDF2(SECRET_SALT, iv, {
            keySize: KEY_SIZE / 32,
            iterations: ITERATIONS
        });
        console.log("Generated key");

        // Decrypt
        const decrypted = CryptoJS.AES.decrypt(
            encryptedData.toString(CryptoJS.enc.Base64),
            key,
            {
                iv: iv,
                padding: CryptoJS.pad.Pkcs7,
                mode: CryptoJS.mode.CBC
            }
        );
        console.log("Decryption successful");

        const result = decrypted.toString(CryptoJS.enc.Utf8);
        console.log("Decrypted result:", result);
        return result;
    } catch (error) {
        console.error('Decryption error details:', {
            error: error.message,
            stack: error.stack,
            input: encrypted
        });
        return '';
    }
};

const decryptObject = (encrypted) => {
    try {
        console.log("Starting decryption of object");
        const decrypted = decrypt(encrypted);
        if (!decrypted) {
            console.error("Decryption returned empty string");
            return null;
        }
        console.log("Attempting to parse JSON:", decrypted);
        const parsed = JSON.parse(decrypted);
        console.log("Successfully parsed JSON");
        return parsed;
    } catch (error) {
        console.error('Object decryption error details:', {
            error: error.message,
            stack: error.stack
        });
        return null;
    }
};

const employeeLogin = async (req, res) => {
    try {
        const { data } = req.body;
        
        if (!data) {
            return res.status(200).json({
                status: "failed",
                msg: 'Invalid request format'
            });
        }

        // Decrypt the login data
        const decryptedData = decryptObject(data);
        
        
        if (!decryptedData || !decryptedData.email || !decryptedData.password) {
            return res.status(200).json({
                status: "failed",
                msg: 'Invalid encrypted data'
            });
        }

        const { email, password } = decryptedData;
        
        const userData = await reportersSchema.findOne({
            mail:email
        }).select('-__v -passwordCopy -_id');

        if (!userData) {
            return res.status(200).json({
                status: "failed",
                msg: 'Invalid Username or Password!'
            });
        }

        const verifyPassword = await userData.compare(password);
        
        if (!verifyPassword) {
            return res.status(200).json({
                status: "failed",
                msg: 'Invalid Credentials'
            });
        }

        if (userData.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        }

        if (!userData.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employement not yet approved..! Kindly Contact your Superior.'
            });
        }

        let userDataCopy = JSON.parse(JSON.stringify(userData));
        let tokens = await metaDataSchema.findOne({ type: "FCM_TOKENS" });

        if (userDataCopy?.profilePicture?.fileName) {
            let url = await getFileTempUrls3(userDataCopy?.profilePicture.fileName);
            userDataCopy['profilePicture']['tempURL'] = url;
        }

        // Encrypt the response data
        const encryptedData = encryptObject({
            msg: 'successfully logged in',
            data: userDataCopy
        });

        // Return with unencrypted status and encrypted data
        return res.status(200).json({
            status: "success",
            data: encryptedData
        });

    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Loging Employee`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Employee Login Page',
            functionality: 'To Login User',
            errorMessage: `${JSON.stringify(error) || ''}`
        });
        console.error('Login error:', error);
        return res.status(200).json({
            status: "failed",
            msg: 'Error while logging in! Try after some time.'
        });
    }
};

module.exports = {
    employeeLogin
};