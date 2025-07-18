const express = require('express')
const { getLatestNews, getMetaData, getNewsTypeCategorizedNews, getNewsCategoryCategorizedNews, getCategoryNewsPaginatedOnly, getCategoryWiseCount, getIndividualNewsInfo, employeeTraceCheck, getVisitorsCount, getTypeCategorizedNewsPaginatedOnly } = require('./publicApiFunction');
const { employeeLogin, fetchNewsListPending, fetchNewsListApproved, fetchNewsListRejected, getAllActiveEmployees, manipulateNews, getAdminIndividualNewsInfo, getEmployeesDataPaginated, getIndividualEmployeeData, manipulateIndividualEmployee, employeeTracingListing ,employeeTracingManagement, employeeTracingActiveEmployeeList, getArticlesDashbordInfo, getPageViewDashboardInfo, getArticlesByCategory, getActiveEmployeeStats, getVisitorTimeSeries, getVisitsTimeSeries, getVisitorLocations } = require('./adminstrationAPIFunction');
const adminAuth = require('../../middleware/adminAuth');
const otpAuthRoutes = require('./otpAuth');

const router = express.Router()

// Public routes
router.use(otpAuthRoutes); // Add OTP authentication routes

router.route('/public/home/getLatestNews').post(getLatestNews);
router.route('/public/home/getNewsTypeCategorizedNews').post(getNewsTypeCategorizedNews);
router.route('/public/home/getNewsCategoryCategorizedNews').post(getNewsCategoryCategorizedNews);
router.route('/public/home/getCategoryNewsPaginatedOnly').post(getCategoryNewsPaginatedOnly);
router.route('/public/home/getTypeCategorizedNewsPaginatedOnly').post(getTypeCategorizedNewsPaginatedOnly);
router.route('/public/metaData').post(getMetaData);
router.route('/public/newsInfo').post(getIndividualNewsInfo);
router.route('/public/employeeTraceCheck').post(employeeTraceCheck);
router.route('/public/getVisitorsCount').post(getVisitorsCount);

// Authentication route (public)
router.route('/admin/employeeLogin').post(employeeLogin);

// Apply adminAuth middleware to all admin routes
const adminRouter = express.Router();
router.use('/admin', adminRouter);

// All routes below this line will use the adminAuth middleware
adminRouter.use(adminAuth);

// Protected admin routes
adminRouter.route('/metaData').post(getMetaData);
adminRouter.route('/news/pending').post(fetchNewsListPending);
adminRouter.route('/news/approved').post(fetchNewsListApproved);
adminRouter.route('/news/rejected').post(fetchNewsListRejected);
adminRouter.route('/news/active-employees').post(getAllActiveEmployees);
adminRouter.route('/employeesData').post(getEmployeesDataPaginated);
adminRouter.route('/individualEmployeeData').post(getIndividualEmployeeData);
adminRouter.route('/manipulateIndividualEmployee').post(manipulateIndividualEmployee);
adminRouter.route('/employeeTracingListing').post(employeeTracingListing);
adminRouter.route('/employeeTracingManagement').post(employeeTracingManagement);
adminRouter.route('/employeeTracingActiveEmployeeList').post(employeeTracingActiveEmployeeList);
adminRouter.route('/getPageViewDashboardInfo').post(getPageViewDashboardInfo);
adminRouter.route('/getArticlesDashbordInfo').post(getArticlesDashbordInfo);
adminRouter.route('/getArticlesByCategory').post(getArticlesByCategory);
adminRouter.route('/getActiveEmployeeStats').post(getActiveEmployeeStats);
adminRouter.route('/getVisitorTimeSeries').post(getVisitorTimeSeries);
adminRouter.route('/getVisitsTimeSeries').post(getVisitsTimeSeries);
adminRouter.route('/getVisitorLocations').post(getVisitorLocations);
adminRouter.route('/manipulateNews').post(manipulateNews);
adminRouter.route('/getIndividualNewsInfo').post(getAdminIndividualNewsInfo);

// Monitoring routes (not protected by admin auth)
router.route('/monitoringOnly/getCategoryWiseCount').post(getCategoryWiseCount);

module.exports = router