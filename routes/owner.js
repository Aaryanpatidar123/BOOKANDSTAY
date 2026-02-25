const express = require('express');
const router = express.Router();
const owner = require('../controllers/owner');
const { isLoggedIn } = require('../middleware');

// Owner dashboard showing pending bookings
router.get('/dashboard', isLoggedIn, owner.renderOwnerDashboard);

// Owner approve/reject booking
router.post('/bookings/:id/approve', isLoggedIn, owner.approveBooking);
router.post('/bookings/:id/reject', isLoggedIn, owner.rejectBooking);

module.exports = router;
