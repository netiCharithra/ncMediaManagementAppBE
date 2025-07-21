const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

// Debug log environment variables
console.log('S3 Config:', {
    region: process.env.BUCKET_REGION,
    accessKeyId: process.env.ACCESS_KEY ? '***' : 'MISSING',
    secretAccessKey: process.env.SECRET_ACCESS_KEY ? '***' : 'MISSING',
    articleBucket: process.env.BUCKET_NAME_ARTICLE || 'MISSING',
    employeeBucket: process.env.BUCKET_NAME_EMPLOYEE_DOCS || 'MISSING'
});

if (!process.env.BUCKET_REGION || !process.env.ACCESS_KEY || !process.env.SECRET_ACCESS_KEY) {
    throw new Error('Missing required S3 configuration in environment variables');
}

const s3Client = new S3Client({
    region: process.env.BUCKET_REGION,
    credentials: {
        accessKeyId: process.env.ACCESS_KEY,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME_ARTICLE = process.env.BUCKET_NAME_ARTICLE;
const BUCKET_NAME_EMPLOYEE_DOCS = process.env.BUCKET_NAME_EMPLOYEE_DOCS;

if (!BUCKET_NAME_ARTICLE || !BUCKET_NAME_EMPLOYEE_DOCS) {
    throw new Error('One or more bucket names are not configured in environment variables');
}

/**
 * Generate a pre-signed URL for downloading a file
 * @param {string} fileName - Name of the file in S3 (with or without extension)
 * @param {number} [expiresIn=3600] - Expiration time in seconds (default: 1 hour)
 * @param {string} [bucketType='articles'] - Type of bucket ('articles' or 'employee_docs')
 * @param {boolean} [tryExtensions=false] - Whether to try different file extensions if file not found
 * @returns {Promise<string>} Pre-signed URL
 */
const generateDownloadUrl = async (fileName, expiresIn = 3600, bucketType = 'articles', tryExtensions = false) => {
    try {
        if (!fileName) {
            throw new Error('File name is required');
        }

        const bucketName = bucketType === 'articles' ? BUCKET_NAME_ARTICLE : BUCKET_NAME_EMPLOYEE_DOCS;
        if (!bucketName) {
            throw new Error(`Bucket name is not configured for type: ${bucketType}`);
        }

        console.log(`Generating URL for ${fileName} in bucket ${bucketName}`);
        
        // Common image extensions to check (only used if tryExtensions is true)
        const imageExtensions = ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.svg'];
        
        // If we're not trying extensions, or if the filename already has an extension, use it as is
        if (!tryExtensions || fileName.includes('.')) {
            console.log(`Using filename as-is: ${fileName}`);
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: fileName
            });
            return await getSignedUrl(s3Client, command, { expiresIn });
        }
        
        // If tryExtensions is true and filename has no extension, try with common extensions
        let lastError;
        console.log(`Trying with different extensions for: ${fileName}`);
        
        for (const ext of imageExtensions) {
            const key = `${fileName}${ext}`;
            try {
                console.log(`Trying with extension ${ext}`);
                const command = new GetObjectCommand({
                    Bucket: bucketName,
                    Key: key
                });
                const url = await getSignedUrl(s3Client, command, { expiresIn });
                console.log(`Successfully generated URL for ${key}`);
                return url;
            } catch (error) {
                console.log(`Failed with extension ${ext}:`, error.message);
                lastError = error;
                continue; // Try next extension
            }
        }
        
        // If all extensions fail, try the original filename as last resort
        try {
            const command = new GetObjectCommand({
                Bucket: bucketType === 'articles' ? BUCKET_NAME_ARTICLE : BUCKET_NAME_EMPLOYEE_DOCS,
                Key: fileName
            });
            return await getSignedUrl(s3Client, command, { expiresIn });
        } catch (error) {
            lastError = error;
        }
        
        throw lastError || new Error('Failed to generate download URL');
    } catch (error) {
        console.error('Error generating download URL for', fileName, ':', error);
        throw new Error(`Failed to generate download URL: ${error.message}`);
    }
};

/**
 * Generate a pre-signed URL for uploading a file
 * @param {string} fileName - Name to give the uploaded file in S3
 * @param {string} [contentType='application/octet-stream'] - MIME type of the file
 * @param {number} [expiresIn=3600] - Expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} Pre-signed URL
 */
const generateUploadUrl = async (fileName, contentType = 'application/octet-stream', expiresIn = 3600, bucketType = 'articles') => {
    try {
        const command = new PutObjectCommand({
            Bucket: bucketType === 'articles' ? BUCKET_NAME_ARTICLE : BUCKET_NAME_EMPLOYEE_DOCS,
            Key: fileName,
            ContentType: contentType
        });
        return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
        console.error('Error generating upload URL:', error);
        throw new Error('Failed to generate upload URL');
    }
};

/**
 * Delete a file from S3
 * @param {string} fileName - Name of the file to delete
 * @returns {Promise<boolean>} True if deletion was successful
 */
const deleteFile = async (fileName, bucketType = 'articles') => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: bucketType === 'articles' ? BUCKET_NAME_ARTICLE : BUCKET_NAME_EMPLOYEE_DOCS,
            Key: fileName
        });
        await s3Client.send(command);
        return true;
    } catch (error) {
        console.error('Error deleting file from S3:', error);
        throw new Error('Failed to delete file from S3');
    }
};

/**
 * Check if a file exists in S3
 * @param {string} fileName - Name of the file to check
 * @returns {Promise<boolean>} True if file exists
 */
const fileExists = async (fileName, bucketType = 'articles') => {
    try {
        const command = new HeadObjectCommand({
            Bucket: bucketType === 'articles' ? BUCKET_NAME_ARTICLE : BUCKET_NAME_EMPLOYEE_DOCS,
            Key: fileName
        });
        await s3Client.send(command);
        return true;
    } catch (error) {
        if (error.name === 'NotFound') {
            return false;
        }
        console.error('Error checking file existence in S3:', error);
        throw error;
    }
};

module.exports = {
    generateDownloadUrl,
    generateUploadUrl,
    deleteFile,
    fileExists,
    BUCKET_NAME_ARTICLE,
    BUCKET_NAME_EMPLOYEE_DOCS
};
