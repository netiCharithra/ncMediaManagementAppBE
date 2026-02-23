const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

/**
 * Dedicated S3 client for the grievance-evidence bucket.
 * This bucket is completely isolated from article/employee-docs buckets
 * to enforce strict data segregation for sensitive legal evidence.
 */
const grievanceS3Client = new S3Client({
    region: process.env.BUCKET_REGION,
    credentials: {
        accessKeyId: process.env.ACCESS_KEY,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
    },
});

const BUCKET_GRIEVANCE_EVIDENCE = process.env.BUCKET_NAME_GRIEVANCE_EVIDENCE;

if (!BUCKET_GRIEVANCE_EVIDENCE) {
    console.warn(
        '[GrievanceS3] WARNING: BUCKET_NAME_GRIEVANCE_EVIDENCE is not configured. ' +
        'Grievance evidence uploads will fail until this env variable is set.'
    );
}

/**
 * Upload a single evidence file to the dedicated grievance S3 bucket.
 *
 * Key strategy: <ticketId>/<timestamp>_<sanitised_filename>
 * This guarantees:
 *  - Files from different grievances never collide.
 *  - Within a grievance, duplicate filenames at different times don't overwrite.
 *  - Keys are opaque (non-guessable) to external parties.
 *
 * @param {string}  ticketId    - Grievance ticket ID (e.g. NC-GR-2026-0001)
 * @param {Buffer}  fileBuffer  - Raw file data
 * @param {string}  originalName - Original filename from multipart upload
 * @param {string}  mimeType    - MIME type of the file
 * @returns {Promise<{ key: string, s3Url: string, contentType: string }>}
 */
const uploadEvidenceFile = async (ticketId, fileBuffer, originalName, mimeType) => {
    if (!BUCKET_GRIEVANCE_EVIDENCE) {
        throw new Error('Grievance evidence bucket is not configured (BUCKET_NAME_GRIEVANCE_EVIDENCE).');
    }

    // Sanitise filename: strip path traversal characters, replace spaces
    const sanitised = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);

    // Capture a single epoch value so S3 metadata and the DB record are identical
    const uploadEpoch = Date.now();
    const key = `${ticketId}/${uploadEpoch}_${sanitised}`;

    const command = new PutObjectCommand({
        Bucket: BUCKET_GRIEVANCE_EVIDENCE,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        // S3 object metadata — all values must be strings per AWS SDK requirement
        Metadata: {
            ticketId,
            originalName,
            uploadedAtEpoch: String(uploadEpoch),   // Epoch ms as string for S3
            uploadedAtIso: new Date(uploadEpoch).toISOString(), // human-readable companion
        },
    });

    await grievanceS3Client.send(command);

    // Build permanent S3 HTTPS URL (not pre-signed – stored for admin access)
    const s3Url = `https://${BUCKET_GRIEVANCE_EVIDENCE}.s3.${process.env.BUCKET_REGION}.amazonaws.com/${key}`;

    // Return uploadEpoch so the controller can persist the exact same value to MongoDB
    return { key, s3Url, contentType: mimeType, uploadEpoch };
};

/**
 * Generate a short-lived pre-signed download URL for a single evidence file.
 * Used by admin controllers when they need to stream evidence securely.
 *
 * @param {string} key - S3 object key
 * @param {number} [expiresIn=3600] - TTL in seconds (default 1 hour)
 * @returns {Promise<string>} Pre-signed URL
 */
const generateEvidenceDownloadUrl = async (key, expiresIn = 3600) => {
    const command = new GetObjectCommand({
        Bucket: BUCKET_GRIEVANCE_EVIDENCE,
        Key: key,
    });
    return getSignedUrl(grievanceS3Client, command, { expiresIn });
};

module.exports = {
    uploadEvidenceFile,
    generateEvidenceDownloadUrl,
    BUCKET_GRIEVANCE_EVIDENCE,
};
