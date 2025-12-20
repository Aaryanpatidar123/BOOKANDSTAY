const express = require('express');
const router = express.Router();
const bookings = require('../controllers/bookings');
const wrapAsync = require('../utils/wrapAsync');

function isLoggedIn(req, res, next) {
    if(req.isAuthenticated()) return next();
    req.flash('error','You must be signed in to book');
    res.redirect('/login');
}

router.get('/new/:listingId', isLoggedIn, wrapAsync(bookings.renderNewBooking));
router.post('/create/:listingId', isLoggedIn, wrapAsync(bookings.createCheckoutSession));
router.get('/success', wrapAsync(bookings.success));
router.get('/pay/:id', isLoggedIn, wrapAsync(bookings.renderPayPage));
router.post('/:id/verify', isLoggedIn, wrapAsync(bookings.verifyPayment));
router.post('/:id/phonepe/create', isLoggedIn, wrapAsync(bookings.createPhonePeOrder));
router.post('/:id/phonepe/complete', isLoggedIn, wrapAsync(bookings.completePhonePe));
router.get('/:id', wrapAsync(bookings.show));
// Dev-only payment mark (enabled when STRIPE_MOCK=true)
router.post('/:id/pay', isLoggedIn, wrapAsync(bookings.markPaid));

module.exports = router;
