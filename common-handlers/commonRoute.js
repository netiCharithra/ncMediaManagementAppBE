const express = require('express')
const { registerReporter, reporterLogin, getMetaData, publishNews, fetchDashboard, addSubscribers, getSubscribers, getEmployeesData, manipulateEmployee,getEmployeeData,
    getNewsInfo,
    getNewsList, getAllEmployees} = require('./commonApiFunction')
const { getHomeData, getIndividualNewsInfo, getCategoryNewsPaginated } = require('./publicApiFunction')

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
router.route('/getSubscribers').post(getSubscribers);
router.route('/getEmployeesData').post(getEmployeesData);
router.route('/manipulateEmployee').post(manipulateEmployee);
router.route('/getEmployeeData').post(getEmployeeData);
router.route('/getNewsList').post(getNewsList);
router.route('/getNewsInfo').post(getNewsInfo);
router.route('/getAllEmployees').post(getAllEmployees);




router.route('/public/getHomeData').post(getHomeData);
router.route('/public/getNewsInfo').post(getIndividualNewsInfo);
router.route('/public/getCategoryNews').post(getCategoryNewsPaginated);
// router.route('/uploadFiles').post('uploadFiles');

module.exports = router