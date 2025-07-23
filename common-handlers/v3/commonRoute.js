const express = require('express');
const router = express.Router();
const { employeeLogin } = require('./controllers/adminstrationAPIFunction');
const { getCategoryWiseCount } = require('./controllers/publicApiFunction');
const adminAuth = require('../../middleware/adminAuth');

// Import route handlers
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Public routes
router.use(publicRoutes);

// Authentication route (public)
router.route('/admin/employeeLogin').post(employeeLogin);

// Apply adminAuth middleware to all admin routes
const adminRouter = express.Router();
router.use('/admin', adminRouter);

// All routes below this line will use the adminAuth middleware
adminRouter.use(adminAuth);

// Protected admin routes
adminRouter.use(adminRoutes);

// Monitoring routes (not protected by admin auth)
router.route('/monitoringOnly/getCategoryWiseCount').post(getCategoryWiseCount);

module.exports = router;