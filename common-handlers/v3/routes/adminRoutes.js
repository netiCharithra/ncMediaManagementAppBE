const express = require('express');
const router = express.Router();
const { 
    fetchNewsListPending, 
    fetchNewsListApproved, 
    fetchNewsListRejected, 
    getAllActiveEmployees, 
    manipulateNews, 
    getAdminIndividualNewsInfo, 
    getEmployeesDataPaginated, 
    getIndividualEmployeeData, 
    manipulateIndividualEmployee, 
    employeeTracingListing,
    employeeTracingManagement, 
    employeeTracingActiveEmployeeList, 
    getArticlesDashbordInfo, 
    getPageViewDashboardInfo, 
    getArticlesByCategory, 
    getActiveEmployeeStats, 
    getVisitorTimeSeries, 
    getVisitsTimeSeries, 
    getVisitorLocations,
    convertPresignedUrlToBase64API,
    getWhatsAppQRCode,
    stopWhatsAppBot
} = require('../controllers/adminstrationAPIFunction');

// All routes in this file are protected by adminAuth middleware
// which is applied in commonRoute.js

// News management routes
router.route('/news/pending').post(fetchNewsListPending);
router.route('/news/approved').post(fetchNewsListApproved);
router.route('/news/rejected').post(fetchNewsListRejected);
router.route('/news/active-employees').post(getAllActiveEmployees);
router.route('/news/manipulateNews').post(manipulateNews);
router.route('/news/getIndividualNewsInfo').post(getAdminIndividualNewsInfo);

// Employee management routes
router.route('/employeesData').post(getEmployeesDataPaginated);
router.route('/individualEmployeeData').post(getIndividualEmployeeData);
router.route('/manipulateIndividualEmployee').post(manipulateIndividualEmployee);

// Employee tracing routes
router.route('/employeeTracingListing').post(employeeTracingListing);
router.route('/employeeTracingManagement').post(employeeTracingManagement);
router.route('/employeeTracingActiveEmployeeList').post(employeeTracingActiveEmployeeList);

// Dashboard and analytics routes
router.route('/dashboard/articles').post(getArticlesDashbordInfo);
router.route('/dashboard/page-views').post(getPageViewDashboardInfo);
router.route('/dashboard/articles-by-category').post(getArticlesByCategory);
router.route('/dashboard/active-employee-stats').post(getActiveEmployeeStats);
router.route('/dashboard/visitor-time-series').post(getVisitorTimeSeries);
router.route('/dashboard/visits-time-series').post(getVisitsTimeSeries);
router.route('/dashboard/visitor-locations').post(getVisitorLocations);

// Utility routes
router.route('/utils/presigned-url-to-base64').post(convertPresignedUrlToBase64API);

// WhatsApp routes
router.route('/whatsapp/qr-code').post(getWhatsAppQRCode);
router.route('/whatsapp/stop-bot').post(stopWhatsAppBot);

module.exports = router;
