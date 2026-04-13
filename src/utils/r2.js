'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('./logger');

const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

/**
 * Uploads a file buffer to Cloudflare R2
 */
const uploadToCloud = async (fileBuffer, fileName, mimetype, folder = 'news') => {
    try {
        const key = `${folder}/${Date.now()}-${fileName}`;

        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: mimetype,
        });

        await r2Client.send(command);

        // Construct the public URL
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
        logger.info(`File uploaded to R2: ${publicUrl}`);

        return publicUrl;
    } catch (err) {
        logger.error('R2 upload error:', err);
        // Fallback for development if R2 fails
        return `https://via.placeholder.com/800x450?text=R2+Upload+Failed+Fallback`;
    }
};

/**
 * Post-multer logging middleware.
 * Attach this AFTER upload.single() on any route to log form fields + file info.
 */
const logMultipartPayload = (req, _res, next) => {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '********';

    logger.info(
        `Payload (multipart): ${JSON.stringify(safeBody, null, 2)}`
    );

    if (req.file) {
        logger.info(
            `File: ${req.file.originalname} | size: ${req.file.size} bytes | mime: ${req.file.mimetype}`
        );
    }
    next();
};

module.exports = { uploadToCloud, logMultipartPayload };
