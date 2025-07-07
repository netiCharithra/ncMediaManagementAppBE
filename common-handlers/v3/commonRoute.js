const express = require('express')
const { getLatestNews, getMetaData, getNewsTypeCategorizedNews, getNewsCategoryCategorizedNews, getCategoryNewsPaginatedOnly, getCategoryWiseCount, getIndividualNewsInfo, employeeTraceCheck, getVisitorsCount } = require('./publicApiFunction');
const { employeeLogin, fetchNewsListPending, fetchNewsListApproved, fetchNewsListRejected, getAllActiveEmployees, manipulateNews, getAdminIndividualNewsInfo, getEmployeesDataPaginated, getIndividualEmployeeData, manipulateIndividualEmployee, employeeTracingListing ,employeeTracingManagement, employeeTracingActiveEmployeeList, getArticlesDashbordInfo, getPageViewDashboardInfo ,getEmployeeDashboardInfo} = require('./adminstrationAPIFunction');

// const { uploadFiles } = require('./uploadImageHandeler')
const router = express.Router()

router.route('/public/home/getLatestNews').post(getLatestNews);
router.route('/public/home/getNewsTypeCategorizedNews').post(getNewsTypeCategorizedNews);
router.route('/public/home/getNewsCategoryCategorizedNews').post(getNewsCategoryCategorizedNews);
router.route('/public/home/getCategoryNewsPaginatedOnly').post(getCategoryNewsPaginatedOnly);
router.route('/public/metaData').post(getMetaData);
router.route('/public/newsInfo').post(getIndividualNewsInfo);
router.route('/public/employeeTraceCheck').post(employeeTraceCheck);
router.route('/public/getArticlesDashbordInfo').post(getArticlesDashbordInfo);
router.route('/public/getVisitorsCount').post(getVisitorsCount);
router.route('/public/getEmployeeDashboardInfo').post(getEmployeeDashboardInfo);

router.route('/admin/employeeLogin').post(employeeLogin);
router.route('/admin/metaData').post(getMetaData);
router.route('/admin/news/pending').post(fetchNewsListPending);
router.route('/admin/news/approved').post(fetchNewsListApproved);
router.route('/admin/news/rejected').post(fetchNewsListRejected);
router.route('/admin/news/active-employees').post(getAllActiveEmployees);
router.route('/admin/employeesData').post(getEmployeesDataPaginated);
router.route('/admin/individualEmployeeData').post(getIndividualEmployeeData);
router.route('/admin/manipulateIndividualEmployee').post(manipulateIndividualEmployee);
router.route('/admin/employeeTracingListing').post(employeeTracingListing);
router.route('/admin/employeeTracingManagement').post(employeeTracingManagement);
router.route('/admin/employeeTracingActiveEmployeeList').post(employeeTracingActiveEmployeeList);
router.route('/admin/getPageViewDashboardInfo').post(getPageViewDashboardInfo);


router.route('/monitoringOnly/getCategoryWiseCount').post(getCategoryWiseCount);
router.route('/admin/manipulateNews').post(manipulateNews);
router.route('/admin/getIndividualNewsInfo').post(getAdminIndividualNewsInfo);
module.exports = router