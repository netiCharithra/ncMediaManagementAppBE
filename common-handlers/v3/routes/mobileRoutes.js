const express = require('express');
const router = express.Router();

// Import mobile-specific controller functions here
const { getPriorityNews, getLatestNews, getMetaData, searchNews, getIndividualNewsInfo, getHelpTeam, getNewsFrames, addNewsFrame, updateNewsFrame, getNewsFrameById, getActiveNewsFrames, getScreenPermissions, updateScreenPermissions, toggleScreenPermission } = require('../controllers/mobileAPIFunctions');

/**
 * Mobile API Routes
 * All routes in this file are prefixed with /api/v3/mobile
 */

// News feed routes
router.route('/getPriorityNews').post(getPriorityNews);
router.route('/getLatestNews').post(getLatestNews);
router.route('/getMetaData').post(getMetaData);
router.route('/searchNews').post(searchNews);

router.route('/getIndividualNewsInfo').post(getIndividualNewsInfo);
router.route('/getHelpTeam').post(getHelpTeam);

router.route('/getNewsFrames').post(getNewsFrames);
router.route('/getActiveNewsFrames').post(getActiveNewsFrames);
router.route('/createFrame').post(addNewsFrame);
router.route('/updateFrame').post(updateNewsFrame);
router.route('/getFrameById').post(getNewsFrameById);

// Mobile Screen Management routes
router.route('/getScreenPermissions').post(getScreenPermissions);
router.route('/updateScreenPermissions').post(updateScreenPermissions);
router.route('/toggleScreenPermission').post(toggleScreenPermission);

module.exports = router;
