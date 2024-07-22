const express = require('express')
const { registerReporter, reporterLogin, getMetaData, publishNews, fetchDashboard, addSubscribers, getSubscribers, getEmployeesData, manipulateEmployee, getEmployeeData,
    getNewsInfo, deleteS3Images,
    getNewsList, getAllEmployees, addSubscriberToGroup, getAllEmployeesV2, newsReportChart, 
    overallNewsReport, getEmployeeActiveCount, fetchNewsListPending,
    fetchNewsListApproved,
    fetchNewsListRejected} = require('./commonApiFunction')
const { getHomeData, getIndividualNewsInfo, getCategoryNewsPaginated, getCategoryNewsPaginatedOnly, setFCMToken, employeeTracing, employeeTracingManagement, employeeTracingListing, employeeTraceCheck, getAllNewsList,
    getDistrictNewsPaginated, getAllNews, requestPublicOTP, validateUserOTP, addPublicUser, addPublicUserNews, listPublicUserNews, updateUserInfo, getUserNewsCount, getNewsInfoV2, getLatestNewsV2, searchNewsV2, getHomeDataV2, getHomeDataV2_NEWSTYPE, getHomeDataV2CategoryWise, getDistrictNews, getNewsNewsType, getHelpTeam } = require('./publicApiFunction')

// const { uploadFiles } = require('./uploadImageHandeler')
const router = express.Router()
const auth = require('./auth')

// router.route('/register').post(register);
router.route('/registerEmployee').post(registerReporter);
router.route('/reporterLogin').post(reporterLogin);
router.route('/getMetaData').post(getMetaData);


router.route('/manipulateNews').post(publishNews);
router.route('/fetchDashboard').post(fetchDashboard);


router.route('/newsReportChart').post(newsReportChart);
router.route('/overallNewsReport').post(overallNewsReport);
router.route('/getEmployeeActiveCount').post(getEmployeeActiveCount);

router.route('/fetchNewsListPending').post(fetchNewsListPending);
router.route('/fetchNewsListApproved').post(fetchNewsListApproved);
router.route('/fetchNewsListRejected').post(fetchNewsListRejected);

router.route('/addSubscribers').post(addSubscribers);
router.route('/addSubscriberToGroup').post(addSubscriberToGroup);
router.route('/getSubscribers').post(getSubscribers);
router.route('/getEmployeesData').post(getEmployeesData);
router.route('/manipulateEmployee').post(manipulateEmployee);
router.route('/getEmployeeData').post(getEmployeeData);
router.route('/getNewsList').post(getNewsList);
router.route('/getNewsInfo').post(getNewsInfo);
router.route('/getAllEmployees').post(getAllEmployees);
router.route('/getAllEmployeesV2').post(getAllEmployeesV2);


router.route('/deleteUploadedImagess3').post(deleteS3Images)

router.route('/public/employeeTracing').post(employeeTracing);
router.route('/public/employeeTracingManagement').post(employeeTracingManagement);
router.route('/public/employeeTracingListing').post(employeeTracingListing);
router.route('/public/employeeTraceCheck').post(employeeTraceCheck);
router.route('/public/getHomeData').post(getHomeData);
router.route('/public/getHomeDataV2').post(getHomeDataV2);
router.route('/public/getHomeDataV2_NEWSTYPE').post(getHomeDataV2_NEWSTYPE);
router.route('/public/getHomeDataV2CategoryWise').post(getHomeDataV2CategoryWise);
router.route('/public/getDistrictNews').post(getDistrictNews);
router.route('/public/getNewsNewsType').post(getNewsNewsType);
router.route('/public/getNewsInfo').post(getIndividualNewsInfo);
router.route('/public/getCategoryNews').post(getCategoryNewsPaginated);
router.route('/public/getCategoryNewsOnly').post(getCategoryNewsPaginatedOnly);
router.route('/public/setFCMToken').post(setFCMToken);
router.route('/public/getNewsList').post(getAllNewsList);
router.route('/public/getDistrictNewsList').post(getDistrictNewsPaginated);
router.route('/public/getAllNews').post(getAllNews);
router.route('/public/requestPublicOTP').post(requestPublicOTP);
router.route('/public/validateUserOTP').post(validateUserOTP);
router.route('/public/addPublicUser').post(addPublicUser);
router.route('/public/addPublicUserNews').post(addPublicUserNews);
router.route('/public/listPublicUserNews').post(listPublicUserNews);
router.route('/public/addPublicUserNews').post(addPublicUserNews);
router.route('/public/updateUserInfo').post(updateUserInfo);
router.route('/public/getUserNewsCount').post(getUserNewsCount);
router.route('/public/getNewsInfoV2').post(getNewsInfoV2);
router.route('/public/getLatestNewsV2').post(getLatestNewsV2);
router.route('/public/searchNewsV2').post(searchNewsV2);
router.route('/public/getHelpTeam').post(getHelpTeam);
// router.route('/uploadFiles').post('uploadFiles');

module.exports = router