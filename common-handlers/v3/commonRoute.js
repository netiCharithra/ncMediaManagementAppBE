const express = require('express')
const { getLatestNews, getMetaData, getNewsTypeCategorizedNews, getNewsCategoryCategorizedNews, getCategoryNewsPaginatedOnly, getCategoryWiseCount, getIndividualNewsInfo } = require('./publicApiFunction');
const { employeeLogin } = require('./adminstrationAPIFunction');

// const { uploadFiles } = require('./uploadImageHandeler')
const router = express.Router()

router.route('/public/home/getLatestNews').post(getLatestNews);
router.route('/public/home/getNewsTypeCategorizedNews').post(getNewsTypeCategorizedNews);
router.route('/public/home/getNewsCategoryCategorizedNews').post(getNewsCategoryCategorizedNews);
router.route('/public/home/getCategoryNewsPaginatedOnly').post(getCategoryNewsPaginatedOnly);
router.route('/public/metaData').post(getMetaData);
router.route('/public/newsInfo').post(getIndividualNewsInfo);


router.route('/admin/employeeLogin').post(employeeLogin);

router.route('/monitoringOnly/getCategoryWiseCount').post(getCategoryWiseCount);
module.exports = router