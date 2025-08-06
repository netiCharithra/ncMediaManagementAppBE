const express = require('express');
const router = express.Router();
const { employeeLogin } = require('./controllers/adminstrationAPIFunction');
const { getCategoryWiseCount } = require('./controllers/publicApiFunction');
const adminAuth = require('../../middleware/adminAuth');
const ensureWhatsAppClientRunning = require('../../middleware/whatsappClientCheck');

// Import route handlers
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const mobileRoutes = require('./routes/mobileRoutes');

// Public routes
router.use(publicRoutes);

// Authentication route (public)
router.route('/admin/employeeLogin').post(employeeLogin);

// Apply adminAuth middleware to all admin routes
const adminRouter = express.Router();
router.use('/admin', adminRouter);

// All routes below this line will use the adminAuth and WhatsApp client check middleware
adminRouter.use(adminAuth);
adminRouter.use(ensureWhatsAppClientRunning);

// Protected admin routes
adminRouter.use(adminRoutes);

// Monitoring routes (not protected by admin auth)
router.route('/monitoringOnly/getCategoryWiseCount').post(getCategoryWiseCount);

router.use('/mobile', mobileRoutes);

module.exports = router;