const express = require('express');
const router = express.Router();
const admin = require('../controllers/admin');
const { isLoggedIn, isAdmin } = require('../middleware');

router.get('/dashboard', isLoggedIn, isAdmin, admin.renderDashboard);
router.get('/users', isLoggedIn, isAdmin, admin.renderUsers);
router.post('/users/:id/toggle-admin', isLoggedIn, isAdmin, admin.toggleUserAdmin);
router.post('/users/:id/delete', isLoggedIn, isAdmin, admin.deleteUser);
router.get('/bookings', isLoggedIn, isAdmin, admin.renderBookings);
router.get('/bookings/:id', isLoggedIn, isAdmin, admin.renderBookingDetails);
router.get('/pay-config', isLoggedIn, admin.renderPayConfig);
router.post('/pay-config', isLoggedIn, admin.postPayConfig);

// Email / SMTP / Google OAuth configuration (dev only - admin only)
router.get('/email-config', isLoggedIn, isAdmin, admin.renderEmailConfig);
router.post('/email-config', isLoggedIn, isAdmin, admin.postEmailConfig);
router.post('/admin-google-auth', isLoggedIn, isAdmin, admin.startGoogleAuth);
router.get('/admin/google-callback', isLoggedIn, isAdmin, admin.googleCallback);
router.post('/send-test-mail', isLoggedIn, isAdmin, admin.sendTestMail);

module.exports = router;