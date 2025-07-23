const express = require('express');
const router = express.Router();

// Import mobile-specific controller functions here
const { getPriorityNews,getLatestNews,getMetaData, searchNews, getIndividualNewsInfo, getHelpTeam ,tempAPI} = require('../controllers/mobileAPIFunctions');

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


module.exports = router;
