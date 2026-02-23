const express = require('express');
const router = express.Router();

const {
    updateGrievanceAction,
    listGrievances,
    getGrievanceDetail,
} = require('../controllers/grievanceController');

const { sendOTP, verifyOTPAndLogin } = require('../otpController');

/**
 * @swagger
 * tags:
 *   name: Grievance (Admin)
 *   description: Protected admin endpoints for managing grievances (requires adminAuth)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     GrievanceActionRequest:
 *       type: object
 *       required: [newStatus, actionTaken, remarks]
 *       properties:
 *         newStatus:
 *           type: string
 *           enum: [SUBMITTED, UNDER_INVESTIGATION, ACTION_TAKEN, RESOLVED, REJECTED]
 *           description: The new status to transition the grievance to
 *         actionTaken:
 *           type: string
 *           description: Specific action performed (e.g. "Notice sent to editor")
 *         remarks:
 *           type: string
 *           description: >
 *             Mandatory legal remarks. This field is REQUIRED for audit trail
 *             compliance and cannot be empty.
 *     GrievanceListRequest:
 *       type: object
 *       properties:
 *         employeeId:
 *           type: string
 *           description: Admin employee ID (required by adminAuth middleware)
 *         status:
 *           type: string
 *           enum: [ALL, SUBMITTED, UNDER_INVESTIGATION, ACTION_TAKEN, RESOLVED, REJECTED]
 *           description: Filter by status (use ALL for no filter)
 *         email:
 *           type: string
 *           format: email
 *           description: Filter by complainant email
 *         ticketId:
 *           type: string
 *           description: Filter by exact ticketId
 *         page:
 *           type: number
 *           default: 1
 *         limit:
 *           type: number
 *           default: 20
 *     GrievanceDetailRequest:
 *       type: object
 *       required: [ticketId]
 *       properties:
 *         employeeId:
 *           type: string
 *           description: Admin employee ID
 *         ticketId:
 *           type: string
 *           description: The human-readable ticketId (e.g. NC-GR-2026-0001)
 */

// ── All routes in this file are protected by adminAuth middleware ──────────────
// (applied via adminRouter.use(adminAuth) in commonRoute.js — no need to re-apply here)

// ── Grievance Officer Login ──────────────────────────────────────────
router.route('/officer/login/send-otp').post((req, res, next) => {
    req.body.isOfficerLogin = true;
    return sendOTP(req, res, next);
});

router.route('/officer/login/verify-otp').post((req, res, next) => {
    req.body.isOfficerLogin = true;
    return verifyOTPAndLogin(req, res, next);
});

/**
 * @swagger
 * /admin/grievance/{id}/action:
 *   patch:
 *     summary: Log a new progress event on a grievance
 *     tags: [Grievance (Admin)]
 *     description: >
 *       Updates the currentStatus and appends a new event object to the
 *       events array, forming the legally-valid audit trail.
 *       The `remarks` field is STRICTLY required.
 *       RESOLVED and REJECTED tickets cannot be re-opened.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB _id of the grievance document
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GrievanceActionRequest'
 *           examples:
 *             underInvestigation:
 *               summary: Move to investigation
 *               value:
 *                 employeeId: EMP001
 *                 newStatus: UNDER_INVESTIGATION
 *                 actionTaken: "Initial review completed. Case assigned to legal team."
 *                 remarks: "Content verified. Matches complaint. Escalated per policy §4.2."
 *             actionTaken:
 *               summary: Action taken
 *               value:
 *                 employeeId: EMP001
 *                 newStatus: ACTION_TAKEN
 *                 actionTaken: "Content removed from portal. Notice sent to editor."
 *                 remarks: "Article #A-2026-112 taken down. Editor notified via email on 2026-02-23."
 *             resolved:
 *               summary: Mark as resolved
 *               value:
 *                 employeeId: EMP001
 *                 newStatus: RESOLVED
 *                 actionTaken: "Grievance resolved. Complainant informed."
 *                 remarks: "Resolution confirmed by legal. Closure email sent to complainant."
 *     responses:
 *       200:
 *         description: Grievance updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 msg:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     ticketId:
 *                       type: string
 *                     currentStatus:
 *                       type: string
 *                     latestEvent:
 *                       $ref: '#/components/schemas/GrievanceEvent'
 *                     totalEvents:
 *                       type: number
 *       400:
 *         description: Validation error (missing newStatus, actionTaken, or remarks)
 *       404:
 *         description: Grievance not found
 *       409:
 *         description: Cannot update a RESOLVED or REJECTED ticket
 *       500:
 *         description: Internal server error
 */
router.route('/:id/action').patch(updateGrievanceAction);

/**
 * @swagger
 * /admin/grievance/list:
 *   post:
 *     summary: List grievances with filtering and pagination
 *     tags: [Grievance (Admin)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GrievanceListRequest'
 *     responses:
 *       200:
 *         description: Paginated list of grievances
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     page:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     totalPages:
 *                       type: number
 *       500:
 *         description: Internal server error
 */
router.route('/list').post(listGrievances);

/**
 * @swagger
 * /admin/grievance/detail:
 *   post:
 *     summary: Get full details of a single grievance including evidence and audit trail
 *     tags: [Grievance (Admin)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GrievanceDetailRequest'
 *     responses:
 *       200:
 *         description: Full grievance record including evidence URLs and events timeline
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
 *       400:
 *         description: Neither id nor ticketId provided
 *       404:
 *         description: Grievance not found
 *       500:
 *         description: Internal server error
 */
router.route('/detail').post(getGrievanceDetail);

module.exports = router;
