const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const axios = require('axios');
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

/**
 * Convert a presigned S3 URL to base64
 * @param {string} presignedUrl - The presigned S3 URL
 * @param {Object} [options={}] - Optional configuration
 * @param {number} [options.timeout=30000] - Request timeout in milliseconds
 * @param {number} [options.maxContentLength=10485760] - Max file size in bytes (default: 10MB)
 * @param {boolean} [options.validateS3Domain=true] - Whether to validate S3 domain
 * @returns {Promise<Object>} Object containing base64 data and metadata
 */
const convertPresignedUrlToBase64 = async (presignedUrl, options = {}) => {
    const {
        timeout = 30000,
        maxContentLength = 10 * 1024 * 1024, // 10MB
        validateS3Domain = true
    } = options;

    // Validate input
    if (!presignedUrl) {
        throw new Error('Presigned URL is required');
    }

    // Validate URL format
    let url;
    try {
        url = new URL(presignedUrl);
    } catch (error) {
        throw new Error('Invalid URL format');
    }

    // Optional: Validate that it's an S3 URL
    if (validateS3Domain && !url.hostname.includes('amazonaws.com') && !url.hostname.includes('s3')) {
        throw new Error('URL must be a valid S3 presigned URL');
    }

    try {
        // Fetch the image from the presigned URL
        const response = await axios.get(presignedUrl, {
            responseType: 'arraybuffer',
            timeout: timeout,
            maxContentLength: maxContentLength,
        });

        // Check if response is successful
        if (response.status !== 200) {
            throw new Error('Failed to fetch image from presigned URL');
        }

        // Get content type from response headers
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        
        // Validate that it's an image
        if (!contentType.startsWith('image/')) {
            throw new Error('URL does not point to an image file');
        }

        // Convert to base64
        const base64Data = Buffer.from(response.data).toString('base64');
        const base64String = `data:${contentType};base64,${base64Data}`;

        // Get file size for response metadata
        const fileSizeBytes = response.data.length;
        const fileSizeKB = Math.round(fileSizeBytes / 1024 * 100) / 100;

        return {
            base64: base64String,
            contentType: contentType,
            fileSizeBytes: fileSizeBytes,
            fileSizeKB: fileSizeKB
        };

    } catch (error) {
        // Handle specific error types and re-throw with more descriptive messages
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            throw new Error('Request timeout - image took too long to download');
        }

        if (error.response && error.response.status === 403) {
            throw new Error('Access denied - presigned URL may have expired or be invalid');
        }

        if (error.response && error.response.status === 404) {
            throw new Error('Image not found at the provided URL');
        }

        // Re-throw the original error if it's already a custom error
        if (error.message.includes('Invalid URL format') || 
            error.message.includes('Presigned URL is required') ||
            error.message.includes('URL must be a valid S3') ||
            error.message.includes('URL does not point to an image')) {
            throw error;
        }

        // For any other errors, wrap them
        throw new Error(`Failed to convert presigned URL to base64: ${error.message}`);
    }
};

module.exports = {
    generateDownloadUrl,
    generateUploadUrl,
    deleteFile,
    fileExists,
    convertPresignedUrlToBase64,
    BUCKET_NAME_ARTICLE,
    BUCKET_NAME_EMPLOYEE_DOCS
};
