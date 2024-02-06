const express = require('express')
const { registerReporter, reporterLogin, getMetaData, publishNews, fetchDashboard, addSubscribers, getSubscribers, getEmployeesData, manipulateEmployee,getEmployeeData,
    getNewsInfo, deleteS3Images,
    getNewsList, getAllEmployees, addSubscriberToGroup, getAllEmployeesV2} = require('./commonApiFunction')
const { getHomeData, getIndividualNewsInfo, getCategoryNewsPaginated, setFCMToken, employeeTracing, employeeTracingManagement, employeeTracingListing, employeeTraceCheck } = require('./publicApiFunction')

// const { uploadFiles } = require('./uploadImageHandeler')
const router = express.Router()
const auth = require('./auth')


// router.route('/register').post(register);
router.route('/registerEmployee').post(registerReporter);
router.route('/reporterLogin').post(reporterLogin);
router.route('/getMetaData').post(getMetaData);


router.route('/manipulateNews').post(publishNews);
router.route('/fetchDashboard').post(fetchDashboard);
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
router.route('/public/getNewsInfo').post(getIndividualNewsInfo);
router.route('/public/getCategoryNews').post(getCategoryNewsPaginated);
router.route('/public/setFCMToken').post(setFCMToken);
// router.route('/uploadFiles').post('uploadFiles');

module.exports = router