const express = require('express');
const router = express.Router();
const { employeeLogin } = require('./controllers/adminstrationAPIFunction');
const { getCategoryWiseCount } = require('./controllers/publicApiFunction');
const adminAuth = require('../../middleware/adminAuth');

// Import route handlers
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const mobileRoutes = require('./routes/mobileRoutes');

// Grievance module — v3
const grievancePublicRoutes = require('./routes/grievancePublicRoutes');
const grievanceAdminRoutes = require('./routes/grievanceAdminRoutes');

// Debug middleware
router.use((req, res, next) => {
    console.log('=== V3 Common Route Hit ===');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    next();
});

// Public routes
router.use(publicRoutes);

// Grievance public routes (unauthenticated — submission + tracking)
router.use(grievancePublicRoutes);

// Authentication route (public)
router.route('/admin/employeeLogin').post(employeeLogin);

// Apply adminAuth middleware to all admin routes
const adminRouter = express.Router();
router.use('/admin', adminRouter);

// All routes below this line will use the adminAuth and WhatsApp client check middleware
adminRouter.use(adminAuth);

// Protected admin routes
adminRouter.use(adminRoutes);

// Grievance admin routes (unauthenticated)
router.use('/grievance/admin', grievanceAdminRoutes);

// Monitoring routes (not protected by admin auth)
router.route('/monitoringOnly/getCategoryWiseCount').post(getCategoryWiseCount);

router.use('/mobile', mobileRoutes);

module.exports = router;