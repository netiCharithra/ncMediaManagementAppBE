const express = require('express');
const router = express.Router();

const {
    submitGrievance,
    trackGrievance,
    getGrievanceReport,
    evidenceUploadMiddleware,
} = require('../controllers/grievanceController');

/**
 * @swagger
 * tags:
 *   name: Grievance (Public)
 *   description: Public grievance submission and tracking endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     GrievanceEvent:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [SUBMITTED, UNDER_INVESTIGATION, ACTION_TAKEN, RESOLVED, REJECTED]
 *           description: Status at this point in the lifecycle
 *         actionTaken:
 *           type: string
 *           description: Description of the concrete action performed
 *         remarks:
 *           type: string
 *           description: Legal remarks for audit trail
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: When this event was recorded
 *     GrievanceSubmitResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         msg:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             ticketId:
 *               type: string
 *               example: NC-GR-2026-0001
 *             currentStatus:
 *               type: string
 *               example: SUBMITTED
 *             createdAt:
 *               type: string
 *               format: date-time
 *             evidenceCount:
 *               type: number
 *     GrievanceTrackResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         data:
 *           type: object
 *           properties:
 *             ticketId:
 *               type: string
 *             currentStatus:
 *               type: string
 *             submittedOn:
 *               type: string
 *               format: date-time
 *             lastUpdated:
 *               type: string
 *               format: date-time
 *             complainantName:
 *               type: string
 *             issue:
 *               type: object
 *             timeline:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/GrievanceEvent'
 */

/**
 * @swagger
 * /public/grievance:
 *   post:
 *     summary: Submit a new public grievance
 *     tags: [Grievance (Public)]
 *     description: >
 *       Multipart/form-data endpoint. Accepts complainant details, issue info
 *       and optional evidence attachments (field name: evidenceFiles).
 *       Returns a unique ticketId for tracking.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [complainantName, complainantEmail, grievanceCategory, description]
 *             properties:
 *               complainantName:
 *                 type: string
 *                 description: Full name of the complainant
 *               complainantEmail:
 *                 type: string
 *                 format: email
 *                 description: Email address of the complainant
 *               complainantPhone:
 *                 type: string
 *                 description: Phone number of the complainant
 *               grievanceCategory:
 *                 type: string
 *                 enum: [MISINFORMATION, PRIVACY_VIOLATION, DEFAMATION, HATE_SPEECH, COPYRIGHT_INFRINGEMENT, HARASSMENT, FAKE_NEWS, OTHER]
 *                 description: Category that best describes the complaint
 *               contentUrl:
 *                 type: string
 *                 description: URL of the content in question (optional)
 *               description:
 *                 type: string
 *                 description: Detailed description (minimum 20 characters)
 *               evidenceFiles:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Evidence files (images, PDFs, videos, etc.)
 *     responses:
 *       201:
 *         description: Grievance submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GrievanceSubmitResponse'
 *       400:
 *         description: Missing or invalid fields
 *       500:
 *         description: Internal server error
 */
router.route('/public/grievance').post(evidenceUploadMiddleware, submitGrievance);

/**
 * @swagger
 * /public/grievance-report:
 *   get:
 *     summary: Aggregation report of grievances within an Epoch time range
 *     tags: [Grievance (Public)]
 *     description: >
 *       Returns per-category counts and resolution-duration statistics for all
 *       grievances whose createdAt Epoch falls within [startTime, endTime].
 *       Resolution Duration is calculated as:
 *         RESOLVED statusHistory.updatedAt  −  createdAt  (both stored as Epoch ms)
 *     parameters:
 *       - in: query
 *         name: startTime
 *         required: true
 *         schema:
 *           type: number
 *           example: 1740000000000
 *         description: Start of the window as Unix Epoch ms (inclusive)
 *       - in: query
 *         name: endTime
 *         required: true
 *         schema:
 *           type: number
 *           example: 1740086400000
 *         description: End of the window as Unix Epoch ms (inclusive)
 *     responses:
 *       200:
 *         description: Report generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     reportWindow:
 *                       type: object
 *                       properties:
 *                         startTime:    { type: number }
 *                         endTime:      { type: number }
 *                         startTimeIso: { type: string, format: date-time }
 *                         endTimeIso:   { type: string, format: date-time }
 *                     overall:
 *                       type: object
 *                       properties:
 *                         total:              { type: number }
 *                         submitted:          { type: number }
 *                         underInvestigation: { type: number }
 *                         actionTaken:        { type: number }
 *                         resolved:           { type: number }
 *                         rejected:           { type: number }
 *                     byCategory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:               { type: string }
 *                           total:                  { type: number }
 *                           resolved:               { type: number }
 *                           rejected:               { type: number }
 *                           underInvestigation:     { type: number }
 *                           avgResolutionHours:     { type: number }
 *                           minResolutionHours:     { type: number }
 *                           maxResolutionHours:     { type: number }
 *                           avgResolutionDurationMs:{ type: number }
 *                           minResolutionDurationMs:{ type: number }
 *                           maxResolutionDurationMs:{ type: number }
 *       400:
 *         description: Missing or invalid startTime / endTime
 *       500:
 *         description: Internal server error
 */
router.route('/public/grievance-report').get(getGrievanceReport);

/**
 * @swagger
 * /public/grievance/{ticketId}/track:
 *   get:
 *     summary: Track the progress of a submitted grievance
 *     tags: [Grievance (Public)]
 *     description: >
 *       Returns the full events timeline for the given ticketId so the
 *       complainant can monitor progress in real-time.
 *       Evidence file URLs are NOT exposed for privacy reasons.
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           example: NC-GR-2026-0001
 *         description: The unique ticket ID issued at submission
 *     responses:
 *       200:
 *         description: Grievance timeline retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GrievanceTrackResponse'
 *       404:
 *         description: No grievance found with the provided ticketId
 *       500:
 *         description: Internal server error
 */
router.route('/public/grievance/:ticketId/track').get(trackGrievance);

module.exports = router;
