const Grievance = require('../../../modals/grievanceSchema');
const errorLogBookSchema = require('../../../modals/errorLogBookSchema');
const Reporters = require('../../../modals/reportersSchema'); // Ensure 'employee' model registration
const { uploadEvidenceFile } = require('../utils/grievanceS3Utils');
const { sendGrievanceSubmissionEmail, sendGrievanceUpdateEmail } = require('../utils/grievanceMailerUtils');
const multer = require('multer');

// ── Multer (memory storage – same pattern as index.js) ───────────────────────
const upload = multer({ storage: multer.memoryStorage() });

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the next sequential ticket ID for the current year.
 * Format: NC-GR-YYYY-XXXX (zero-padded to 4 digits)
 *
 * DB-driven counter — survives server restarts.
 *
 * @returns {Promise<string>}
 */
const generateTicketId = async () => {
    const year = new Date().getFullYear();
    const prefix = `NC-GR-${year}-`;

    const count = await Grievance.countDocuments({
        ticketId: { $regex: `^${prefix}` },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `${prefix}${sequence}`;
};

// Multer middleware exported so route can apply it before the controller
const evidenceUploadMiddleware = upload.array('evidenceFiles');

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER: submitGrievance
// POST /api/v3/public/grievance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle submission of a new public grievance.
 *
 * Accepts multipart/form-data with optional 'evidenceFiles' binary attachments.
 * Body fields: name, email, phone, category, contentUrl, description
 *
 * All timestamps stored as Unix Epoch (Number, ms) — set via Date.now().
 */
const submitGrievance = async (req, res) => {
    try {
        console.log('--- New Grievance Submission Received ---');
        const { complainantName, complainantEmail, complainantPhone, grievanceCategory, contentUrl, description } = req.body;
        console.log('Submission Payload:', { complainantName, complainantEmail, grievanceCategory, hasContentUrl: !!contentUrl, descriptionLength: description?.length });

        // ── Input validation ───────────────────────────────────────────────
        const missing = [];
        if (!complainantName) missing.push('complainantName');
        if (!complainantEmail) missing.push('complainantEmail');
        // complainantPhone is now optional as per updated schema
        if (!grievanceCategory) missing.push('grievanceCategory');
        if (!description) missing.push('description');

        if (missing.length) {
            console.warn(`[submitGrievance] Validation failed: Missing fields - ${missing.join(', ')}`);
            return res.status(400).json({
                status: 'failed',
                msg: `Missing required fields: ${missing.join(', ')}`,
            });
        }

        if (description.trim().length < 20) {
            console.warn('[submitGrievance] Validation failed: Description too short');
            return res.status(400).json({
                status: 'failed',
                msg: 'Description must be at least 20 characters long.',
            });
        }

        // ── Generate unique ticket ID ──────────────────────────────────────
        console.log('[submitGrievance] Generating ticket ID...');
        const ticketId = await generateTicketId();
        console.log(`[submitGrievance] Ticket ID generated: ${ticketId}`);

        // ── Capture submission Epoch ───────────────────────────────────────
        const nowEpoch = Date.now();

        // ── Upload evidence files to dedicated grievance S3 bucket ─────────
        const evidenceArr = [];
        if (req.files && req.files.length > 0) {
            console.log(`[submitGrievance] Processing ${req.files.length} evidence file(s)...`);
            for (const file of req.files) {
                try {
                    const result = await uploadEvidenceFile(
                        ticketId,
                        file.buffer,
                        file.originalname,
                        file.mimetype
                    );
                    evidenceArr.push({
                        fileName: file.originalname,
                        s3Url: result.s3Url,
                        contentType: result.contentType,
                        uploadedAt: result.uploadEpoch,
                    });
                    console.log(`[submitGrievance] Successfully uploaded file: ${file.originalname}`);
                } catch (s3Error) {
                    console.error(`[submitGrievance] S3 Upload failed for ${file.originalname}:`, s3Error);
                    throw s3Error; // Re-throw to be caught by main catch block
                }
            }
        }

        // ── Build the initial SUBMITTED statusHistory entry ────────────────
        const submittedEntry = {
            status: 'SUBMITTED',
            updatedAt: nowEpoch,
            remarks: `Ticket ${ticketId} created. Awaiting editorial review.`,
            actionTaken: 'Grievance submitted by complainant via public portal.',
            processedBy: null,
        };

        // ── Persist to MongoDB ─────────────────────────────────────────────
        console.log('[submitGrievance] Persisting grievance to database...');
        const grievance = await Grievance.create({
            ticketId,
            createdAt: nowEpoch,
            complainantDetails: {
                name: complainantName.trim(),
                email: complainantEmail.trim().toLowerCase(),
                phone: complainantPhone ? complainantPhone.trim() : '',
            },
            issue: {
                category: grievanceCategory.toUpperCase(), // Converting to uppercase to match schema enum
                contentUrl: contentUrl ? contentUrl.trim() : '',
                description: description.trim(),
            },
            evidence: evidenceArr,
            currentStatus: 'SUBMITTED',
            statusHistory: [submittedEntry],
        });
        console.log(`[submitGrievance] Grievance successfully created with ID: ${grievance._id}`);

        // ── Send Confirmation Email ───────────────────────────────────────
        // Trigger as non-blocking (don't await if you want faster response, but better to ensure it's triggered)
        sendGrievanceSubmissionEmail(
            complainantEmail.trim().toLowerCase(),
            complainantName.trim(),
            ticketId,
            grievanceCategory.toUpperCase()
        );

        return res.status(200).json({
            status: 'success',
            msg: 'Your grievance has been submitted successfully.',
            data: {
                ticketId: grievance.ticketId,
                currentStatus: grievance.currentStatus,
                createdAt: grievance.createdAt,
                evidenceCount: evidenceArr.length,
            },
        });
    } catch (error) {
        console.error('CRITICAL ERROR: [submitGrievance] Failed to process grievance submission');
        console.error('Error Details:', {
            message: error.message,
            stack: error.stack,
            body: req.body,
            files: req.files ? req.files.map(f => f.originalname) : []
        });

        try {
            await errorLogBookSchema.create({
                message: 'Error while submitting grievance',
                stackTrace: JSON.stringify(error.stack ? error.stack.split('\n') : ['no stack']),
                page: 'Grievance Submission',
                functionality: 'submitGrievance',
                errorMessage: JSON.stringify(error.message || error),
            });
        } catch (logError) {
            console.error('[submitGrievance] Failed to log error to errorLogBookSchema:', logError);
        }

        return res.status(500).json({
            status: 'failed',
            msg: 'An error occurred while processing your grievance. Please try again.',
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER: trackGrievance
// GET /api/v3/public/grievance/:ticketId/track
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public endpoint: real-time progress timeline for a complainant.
 * Evidence S3 URLs are intentionally withheld (public safety).
 * statusHistory is sorted oldest → newest.
 */
const trackGrievance = async (req, res) => {
    try {
        const { ticketId } = req.params;

        if (!ticketId) {
            return res.status(400).json({ status: 'failed', msg: 'ticketId is required.' });
        }

        const grievance = await Grievance.findOne(
            { ticketId: ticketId.toUpperCase() },
            {
                ticketId: 1,
                currentStatus: 1,
                createdAt: 1,
                'complainantDetails.name': 1,
                'issue.category': 1,
                'issue.description': 1,
                statusHistory: 1,
            }
        ).lean();

        if (!grievance) {
            return res.status(404).json({
                status: 'failed',
                msg: `No grievance found with ticket ID: ${ticketId.toUpperCase()}`,
            });
        }

        // Sort statusHistory oldest → newest (by Epoch updatedAt)
        const timeline = (grievance.statusHistory || []).sort(
            (a, b) => a.updatedAt - b.updatedAt
        );

        return res.status(200).json({
            status: 'success',
            data: {
                ticketId: grievance.ticketId,
                currentStatus: grievance.currentStatus,
                submittedOn: grievance.createdAt,     // Epoch ms
                issue: grievance.issue,
                complainantName: grievance.complainantDetails?.name,
                timeline,
            },
        });
    } catch (error) {
        console.error('[trackGrievance] Error:', error);
        return res.status(500).json({
            status: 'failed',
            msg: 'An error occurred while fetching grievance details.',
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER: updateGrievanceAction  (ADMIN PROTECTED)
// PATCH /api/v3/admin/grievance/:id/action
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a new status transition on an existing grievance.
 *
 * Pushes a new object to statusHistory.updatedAt = Date.now() (Epoch ms).
 * remarks is STRICTLY required for legal audit-trail compliance.
 * RESOLVED and REJECTED are terminal states — no further updates allowed.
 */
const updateGrievanceAction = async (req, res) => {
    try {
        const { id } = req.params;
        const { newStatus, actionTaken, remarks, officerId, officerName } = req.body;

        // ── Validation ─────────────────────────────────────────────────────
        const validStatuses = ['SUBMITTED', 'UNDER_INVESTIGATION', 'ACTION_TAKEN', 'RESOLVED', 'REJECTED'];

        if (!newStatus || !validStatuses.includes(newStatus)) {
            return res.status(400).json({
                status: 'failed',
                msg: `newStatus is required and must be one of: ${validStatuses.join(', ')}`,
            });
        }

        if (!actionTaken || actionTaken.trim().length === 0) {
            return res.status(400).json({
                status: 'failed',
                msg: 'actionTaken is required and cannot be empty.',
            });
        }

        // Remarks are STRICTLY required — legal audit trail
        if (!remarks || remarks.trim().length === 0) {
            return res.status(400).json({
                status: 'failed',
                msg: 'remarks is strictly required to maintain a valid legal audit trail.',
            });
        }

        // ── Fetch ticket ───────────────────────────────────────────────────
        // Support finding by both MongoDB _id and human-readable ticketId
        const mongoose = require('mongoose');
        const filter = mongoose.Types.ObjectId.isValid(id)
            ? { _id: id }
            : { ticketId: id.toUpperCase().trim() };

        const grievance = await Grievance.findOne(filter);

        if (!grievance) {
            return res.status(404).json({ status: 'failed', msg: 'Grievance not found.' });
        }

        // ── Terminal-state guard ───────────────────────────────────────────
        if (['RESOLVED', 'REJECTED'].includes(grievance.currentStatus)) {
            return res.status(409).json({
                status: 'failed',
                msg: `Cannot update a grievance that is already ${grievance.currentStatus}. This ticket is closed.`,
            });
        }

        // ── Officer Validation ─────────────────────────────────────────────
        if (!officerId || officerId.trim().length === 0) {
            return res.status(400).json({
                status: 'failed',
                msg: 'officerId is required to take an action.',
            });
        }

        const officer = await Reporters.findOne({ employeeId: officerId.trim() });

        if (!officer) {
            return res.status(404).json({
                status: 'failed',
                msg: `Officer not found with ID: ${officerId}`,
            });
        }

        if (!officer.rootUser) {
            return res.status(403).json({
                status: 'failed',
                msg: 'You are not authorized to perform this action. Must be a rootUser.',
            });
        }

        // ── Build new statusHistory entry ──────────────────────────────────
        const newHistoryEntry = {
            status: newStatus,
            updatedAt: Date.now(),                    // ← Epoch ms
            remarks: remarks.trim(),
            actionTaken: actionTaken.trim(),
            officerId: officerId ? officerId.trim() : null,
            officerName: officerName ? officerName.trim() : null,
        };

        // ── Atomic update: push to statusHistory + update currentStatus ────
        const updatedGrievance = await Grievance.findByIdAndUpdate(
            grievance._id,
            {
                $set: { currentStatus: newStatus },
                $push: { statusHistory: newHistoryEntry },
            },
            { new: true, runValidators: true }
        ).select('-__v');

        // ── Send Status Update Email ──────────────────────────────────────
        if (grievance.complainantDetails && grievance.complainantDetails.email) {
            sendGrievanceUpdateEmail(
                grievance.complainantDetails.email,
                grievance.complainantDetails.name,
                grievance.ticketId,
                newStatus,
                actionTaken.trim(),
                remarks.trim()
            );
        }

        return res.status(200).json({
            status: 'success',
            msg: `Grievance status updated to ${newStatus}.`,
            data: {
                ticketId: updatedGrievance.ticketId,
                currentStatus: updatedGrievance.currentStatus,
                latestEntry: newHistoryEntry,
                totalEntries: updatedGrievance.statusHistory.length,
            },
        });
    } catch (error) {
        console.error('[updateGrievanceAction] Error:', error);

        try {
            await errorLogBookSchema.create({
                message: 'Error while updating grievance action',
                stackTrace: JSON.stringify(error.stack ? error.stack.split('\n') : ['no stack']),
                page: 'Grievance Management',
                functionality: 'updateGrievanceAction',
                errorMessage: JSON.stringify(error),
                employeeId: req.employee?.employeeId || '',
            });
        } catch (_) { /* swallow logbook error */ }

        return res.status(500).json({
            status: 'failed',
            msg: 'An error occurred while updating the grievance.',
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER: getGrievanceReport  (PUBLIC)
// GET /api/v3/public/grievance-report?startTime=<epoch>&endTime=<epoch>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregation report: summary statistics and resolution durations for
 * grievances submitted within a given Epoch time range.
 *
 * Query params:
 *   startTime {Number}  - Epoch ms (inclusive lower bound for createdAt)
 *   endTime   {Number}  - Epoch ms (inclusive upper bound for createdAt)
 *
 * Aggregation pipeline:
 *  Stage 1  $match    — filter createdAt within [startTime, endTime]
 *  Stage 2  $addFields — extract the RESOLVED statusHistory entry via $filter
 *  Stage 3  $addFields — $subtract resolvedAt Epoch – createdAt Epoch = duration (ms)
 *  Stage 4  $group    — count by category + compute avg/min/max resolution durations
 *  Stage 5  $project  — clean up field names for the response
 */
const getGrievanceReport = async (req, res) => {
    try {
        const { startTime, endTime } = req.query;

        // ── Param validation ───────────────────────────────────────────────
        if (!startTime || !endTime) {
            return res.status(400).json({
                status: 'failed',
                msg: 'startTime and endTime query params are required (Unix Epoch ms).',
            });
        }

        const startEpoch = Number(startTime);
        const endEpoch = Number(endTime);

        if (isNaN(startEpoch) || isNaN(endEpoch)) {
            return res.status(400).json({
                status: 'failed',
                msg: 'startTime and endTime must be valid numbers (Unix Epoch ms).',
            });
        }

        if (startEpoch >= endEpoch) {
            return res.status(400).json({
                status: 'failed',
                msg: 'startTime must be less than endTime.',
            });
        }

        const pipeline = [
            // ── Stage 1: Filter by submission Epoch range ──────────────────
            {
                $match: {
                    createdAt: { $gte: startEpoch, $lte: endEpoch },
                },
            },

            // ── Stage 2: Extract the RESOLVED statusHistory entry ──────────
            // $filter returns an array; we take $arrayElemAt [0] to get the
            // single RESOLVED entry (null if the ticket isn't resolved yet).
            {
                $addFields: {
                    resolvedEntry: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: '$statusHistory',
                                    as: 'entry',
                                    cond: { $eq: ['$$entry.status', 'RESOLVED'] },
                                },
                            },
                            0,
                        ],
                    },
                },
            },

            // ── Stage 3: Calculate resolution duration (ms) ───────────────
            // $subtract on two Number (Epoch) fields — no cast needed.
            // resolvedEntry.updatedAt (Epoch ms) - createdAt (Epoch ms) = duration in ms.
            // Null for unresolved tickets.
            {
                $addFields: {
                    resolutionDurationMs: {
                        $cond: {
                            if: { $ifNull: ['$resolvedEntry', false] },
                            then: { $subtract: ['$resolvedEntry.updatedAt', '$createdAt'] },
                            else: null,
                        },
                    },
                },
            },

            // ── Stage 4: Group by issue category ──────────────────────────
            {
                $group: {
                    _id: '$issue.category',
                    total: { $sum: 1 },
                    resolved: {
                        $sum: {
                            $cond: [{ $eq: ['$currentStatus', 'RESOLVED'] }, 1, 0],
                        },
                    },
                    rejected: {
                        $sum: {
                            $cond: [{ $eq: ['$currentStatus', 'REJECTED'] }, 1, 0],
                        },
                    },
                    underInvestigation: {
                        $sum: {
                            $cond: [{ $eq: ['$currentStatus', 'UNDER_INVESTIGATION'] }, 1, 0],
                        },
                    },
                    // Average resolution duration in ms across resolved tickets only
                    avgResolutionDurationMs: {
                        $avg: '$resolutionDurationMs',
                    },
                    minResolutionDurationMs: {
                        $min: '$resolutionDurationMs',
                    },
                    maxResolutionDurationMs: {
                        $max: '$resolutionDurationMs',
                    },
                },
            },

            // ── Stage 5: Project clean output ──────────────────────────────
            {
                $project: {
                    _id: 0,
                    category: '$_id',
                    total: 1,
                    resolved: 1,
                    rejected: 1,
                    underInvestigation: 1,
                    // Convert ms → hours for readability (2 decimal places via $round)
                    avgResolutionHours: {
                        $round: [{ $divide: ['$avgResolutionDurationMs', 3600000] }, 2],
                    },
                    minResolutionHours: {
                        $round: [{ $divide: ['$minResolutionDurationMs', 3600000] }, 2],
                    },
                    maxResolutionHours: {
                        $round: [{ $divide: ['$maxResolutionDurationMs', 3600000] }, 2],
                    },
                    // Raw ms values also included for frontend chart flexibility
                    avgResolutionDurationMs: 1,
                    minResolutionDurationMs: 1,
                    maxResolutionDurationMs: 1,
                },
            },

            // ── Stage 6: Sort by total (desc) ──────────────────────────────
            { $sort: { total: -1 } },
        ];

        const categoryStats = await Grievance.aggregate(pipeline);

        // ── Overall totals (single $match pass) ───────────────────────────
        const overallPipeline = [
            { $match: { createdAt: { $gte: startEpoch, $lte: endEpoch } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    submitted: { $sum: { $cond: [{ $eq: ['$currentStatus', 'SUBMITTED'] }, 1, 0] } },
                    underInvestigation: { $sum: { $cond: [{ $eq: ['$currentStatus', 'UNDER_INVESTIGATION'] }, 1, 0] } },
                    actionTaken: { $sum: { $cond: [{ $eq: ['$currentStatus', 'ACTION_TAKEN'] }, 1, 0] } },
                    resolved: { $sum: { $cond: [{ $eq: ['$currentStatus', 'RESOLVED'] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ['$currentStatus', 'REJECTED'] }, 1, 0] } },
                },
            },
            { $project: { _id: 0 } },
        ];

        // ── Monthly Trend breakdown ──────────────────────────────────────
        const monthlyPipeline = [
            { $match: { createdAt: { $gte: startEpoch, $lte: endEpoch } } },
            {
                $addFields: {
                    dateObj: { $toDate: '$createdAt' }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$dateObj' },
                        year: { $year: '$dateObj' }
                    },
                    total: { $sum: 1 },
                    resolved: { $sum: { $cond: [{ $eq: ['$currentStatus', 'RESOLVED'] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ['$currentStatus', 'REJECTED'] }, 1, 0] } },
                    underInvestigation: { $sum: { $cond: [{ $eq: ['$currentStatus', 'UNDER_INVESTIGATION'] }, 1, 0] } },
                    submitted: { $sum: { $cond: [{ $eq: ['$currentStatus', 'SUBMITTED'] }, 1, 0] } },
                }
            },
            {
                $project: {
                    _id: 0,
                    month: '$_id.month',
                    year: '$_id.year',
                    total: 1,
                    resolved: 1,
                    rejected: 1,
                    underInvestigation: 1,
                    submitted: 1,
                }
            },
            { $sort: { year: -1, month: -1 } }
        ];

        const [[overall = {}], monthlyTrend] = await Promise.all([
            Grievance.aggregate(overallPipeline),
            Grievance.aggregate(monthlyPipeline)
        ]);

        return res.status(200).json({
            status: 'success',
            data: {
                reportWindow: {
                    startTime: startEpoch,
                    endTime: endEpoch,
                    startTimeIso: new Date(startEpoch).toISOString(),
                    endTimeIso: new Date(endEpoch).toISOString(),
                },
                overall,
                byCategory: categoryStats,
                monthlyTrend,
            },
        });
    } catch (error) {
        console.error('[getGrievanceReport] Error:', error);
        return res.status(500).json({
            status: 'failed',
            msg: 'An error occurred while generating the grievance report.',
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER: listGrievances  (ADMIN PROTECTED)
// POST /api/v3/admin/grievance/list
// ─────────────────────────────────────────────────────────────────────────────

const listGrievances = async (req, res) => {
    try {
        const { status, email, ticketId, page = 1, limit = 20 } = req.body;

        const filter = {};
        if (status && status !== 'ALL') filter.currentStatus = status;
        if (email) filter['complainantDetails.email'] = email.toLowerCase().trim();
        if (ticketId) filter.ticketId = ticketId.toUpperCase().trim();

        const skip = (Number(page) - 1) * Number(limit);

        const [grievances, total] = await Promise.all([
            Grievance.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select('-__v')
                .lean(),
            Grievance.countDocuments(filter),
        ]);

        return res.status(200).json({
            status: 'success',
            data: grievances,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        console.error('[listGrievances] Error:', error);
        return res.status(500).json({
            status: 'failed',
            msg: 'An error occurred while fetching the grievance list.',
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER: getGrievanceDetail  (ADMIN PROTECTED)
// POST /api/v3/admin/grievance/detail
// ─────────────────────────────────────────────────────────────────────────────

const getGrievanceDetail = async (req, res) => {
    try {
        const { ticketId } = req.body;

        if (!ticketId) {
            return res.status(400).json({ status: 'failed', msg: 'ticketId is required.' });
        }

        const filter = { ticketId: ticketId.toUpperCase().trim() };
        const grievance = await Grievance.findOne(filter)
            .select('-__v')
            .lean();

        if (!grievance) {
            return res.status(404).json({ status: 'failed', msg: 'Grievance not found.' });
        }

        // Sort statusHistory oldest → newest
        grievance.statusHistory = (grievance.statusHistory || []).sort(
            (a, b) => a.updatedAt - b.updatedAt
        );

        return res.status(200).json({ status: 'success', data: grievance });
    } catch (error) {
        console.error('[getGrievanceDetail] Error:', error);
        return res.status(500).json({
            status: 'failed',
            msg: 'An error occurred while fetching grievance details.',
        });
    }
};

module.exports = {
    submitGrievance,
    trackGrievance,
    updateGrievanceAction,
    getGrievanceReport,
    listGrievances,
    getGrievanceDetail,
    evidenceUploadMiddleware,
};
