const express = require('express');
const router = express.Router();
const admin = require('../controllers/admin');

function isLoggedIn(req, res, next) {
    if(req.isAuthenticated()) return next();
    req.flash('error','You must be signed in to access this page');
    res.redirect('/login');
}

router.get('/pay-config', isLoggedIn, admin.renderPayConfig);
router.post('/pay-config', isLoggedIn, admin.postPayConfig);

// Email / SMTP / Google OAuth configuration (dev only)
router.get('/email-config', isLoggedIn, admin.renderEmailConfig);
router.post('/email-config', isLoggedIn, admin.postEmailConfig);
router.post('/admin-google-auth', isLoggedIn, admin.startGoogleAuth);
router.get('/admin/google-callback', isLoggedIn, admin.googleCallback);
router.post('/send-test-mail', isLoggedIn, admin.sendTestMail);

module.exports = router;