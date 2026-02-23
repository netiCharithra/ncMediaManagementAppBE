const mongoose = require('mongoose');

/**
 * statusHistory sub-document — every lifecycle transition is appended here.
 *
 * All time values are stored as Unix Epoch (Number / milliseconds) so that
 * MongoDB aggregation pipelines can use $subtract directly on them to
 * calculate durations (e.g., resolution time = resolvedAt - createdAt).
 */
const statusHistorySchema = new mongoose.Schema(
    {
        status: {
            type: String,
            required: true,
            enum: ['SUBMITTED', 'UNDER_INVESTIGATION', 'ACTION_TAKEN', 'RESOLVED', 'REJECTED'],
        },
        // Epoch ms — set via Date.now() in the controller
        updatedAt: {
            type: Number,
            required: true,
        },
        remarks: {
            type: String,
            required: true,
            trim: true,
        },
        // Human-readable description of the concrete action taken at this step
        actionTaken: {
            type: String,
            required: true,
            trim: true,
        },
        // Reporter / admin who processed this step
        officerId: {
            type: String,
            default: null,
            trim: true,
        },
        officerName: {
            type: String,
            default: null,
            trim: true,
        },
    },
    { _id: true }
);

/**
 * Main Grievance schema.
 *
 * ticketId format : NC-GR-YYYY-XXXX  (e.g. NC-GR-2026-0001)
 *
 * Key design: ALL time fields are stored as Unix Epoch (Number, ms).
 * This makes aggregation arithmetic trivial — no Date → Number casting needed.
 */
const grievanceSchema = new mongoose.Schema(
    {
        // ── Unique Ticket Identifier ──────────────────────────────────────
        ticketId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
            match: [/^NC-GR-\d{4}-\d{4}$/, 'ticketId must match pattern NC-GR-YYYY-XXXX'],
        },

        // ── Epoch Timestamp of Submission ─────────────────────────────────
        // Explicit Number field — NOT Mongoose timestamps.
        // Used as the baseline for resolution-duration aggregation.
        createdAt: {
            type: Number,
            required: true,
        },

        // ── Complainant Details ───────────────────────────────────────────
        complainantDetails: {
            name: {
                type: String,
                required: [true, 'Complainant name is required'],
                trim: true,
            },
            email: {
                type: String,
                required: [true, 'Complainant email is required'],
                trim: true,
                lowercase: true,
                match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
            },
            phone: {
                type: String,
                required: [false, 'Complainant phone number is required'],
                trim: true,
            },
        },

        // ── Issue Details ─────────────────────────────────────────────────
        issue: {
            category: {
                type: String,
                required: [true, 'Issue category is required'],
                trim: true,
                enum: [
                    'MISINFORMATION',
                    'PRIVACY_VIOLATION',
                    'DEFAMATION',
                    'HATE_SPEECH',
                    'COPYRIGHT_INFRINGEMENT',
                    'HARASSMENT',
                    'FAKE_NEWS',
                    'OTHER',
                ],
            },
            contentUrl: {
                type: String,
                trim: true,
                default: '',
            },
            description: {
                type: String,
                required: [true, 'Issue description is required'],
                trim: true,
                minlength: [20, 'Description must be at least 20 characters'],
            },
        },

        // ── Evidence (S3 URLs) ────────────────────────────────────────────
        evidence: {
            type: [
                {
                    fileName: { type: String, required: true },
                    s3Url: { type: String, required: true },
                    contentType: { type: String, default: 'application/octet-stream' },
                    // Epoch ms — matches upload Epoch stored in S3 object metadata
                    uploadedAt: { type: Number, required: true },
                },
            ],
            default: [],
        },

        // ── Lifecycle Status ──────────────────────────────────────────────
        currentStatus: {
            type: String,
            required: true,
            enum: ['SUBMITTED', 'UNDER_INVESTIGATION', 'ACTION_TAKEN', 'RESOLVED', 'REJECTED'],
            default: 'SUBMITTED',
        },

        // ── Status History (Audit Trail) ──────────────────────────────────
        // Each element records what happened and WHEN (as Epoch ms).
        // The RESOLVED entry's updatedAt minus root createdAt = resolution duration.
        statusHistory: {
            type: [statusHistorySchema],
            default: [],
        },
    },
    {
        // Disable Mongoose auto-timestamps — we manage createdAt manually as Number.
        timestamps: false,
        collection: 'grievances',
    }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Fast lookup by ticketId (complainant tracking endpoint)
grievanceSchema.index({ ticketId: 1 }, { unique: true });

// Fast lookup by complainant email (compliance / repeat-complainant queries)
grievanceSchema.index({ 'complainantDetails.email': 1 });

// Range queries on createdAt Epoch (aggregation report endpoint)
grievanceSchema.index({ createdAt: 1 });

// Compound index for admin list filtering
grievanceSchema.index({ currentStatus: 1, createdAt: -1 });

module.exports = mongoose.model('Grievance', grievanceSchema);
