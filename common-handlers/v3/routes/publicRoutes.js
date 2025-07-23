const express = require('express');
const router = express.Router();
const { 
    getLatestNews, 
    getMetaData, 
    getNewsTypeCategorizedNews, 
    getNewsCategoryCategorizedNews, 
    getCategoryNewsPaginatedOnly, 
    getIndividualNewsInfo, 
    employeeTraceCheck, 
    getVisitorsCount, 
    getTypeCategorizedNewsPaginatedOnly 
} = require('../controllers/publicApiFunction');
const otpAuthRoutes = require('./../otpAuth');

// Add OTP authentication routes
router.use(otpAuthRoutes);

// Public API routes
router.route('/public/home/getLatestNews').post(getLatestNews);
router.route('/public/home/getNewsTypeCategorizedNews').post(getNewsTypeCategorizedNews);
router.route('/public/home/getNewsCategoryCategorizedNews').post(getNewsCategoryCategorizedNews);
router.route('/public/home/getCategoryNewsPaginatedOnly').post(getCategoryNewsPaginatedOnly);
router.route('/public/home/getTypeCategorizedNewsPaginatedOnly').post(getTypeCategorizedNewsPaginatedOnly);
router.route('/public/metaData').post(getMetaData);
router.route('/public/newsInfo').post(getIndividualNewsInfo);
router.route('/public/employeeTraceCheck').post(employeeTraceCheck);
router.route('/public/getVisitorsCount').post(getVisitorsCount);

module.exports = router;
