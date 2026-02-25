const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const mongoose = require('mongoose');

// Owner dashboard showing pending bookings for listings they own
module.exports.renderOwnerDashboard = async (req, res, next) => {
  try {
    if (!req.user) {
      req.flash('error', 'Please log in');
      return res.redirect('/login');
    }
    // Find all listings owned by this user
    const listings = await Listing.find({ owner: req.user._id }).select('_id');
    const listingIds = listings.map(l => l._id);
    
    // Find pending bookings for those listings
    const pendingBookings = await Booking.find({
      listing: { $in: listingIds },
      status: 'pending'
    }).populate('user').populate('listing').sort({ createdAt: -1 }).lean();

    // Find approved/rejected bookings too for overview
    const approvedBookings = await Booking.find({
      listing: { $in: listingIds },
      status: 'approved'
    }).populate('user').populate('listing').sort({ createdAt: -1 }).limit(10).lean();

    res.render('owner/dashboard', { pendingBookings, approvedBookings });
  } catch (e) {
    next(e);
  }
};

// Owner approve a booking
module.exports.approveBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/owner/dashboard');
    }

    const booking = await Booking.findById(id).populate('listing');
    if (!booking) {
      req.flash('error', 'Booking not found');
      return res.redirect('/owner/dashboard');
    }

    // Check if user owns the listing
    if (!booking.listing.owner || booking.listing.owner.toString() !== req.user._id.toString()) {
      req.flash('error', 'You do not own this listing');
      return res.redirect('/owner/dashboard');
    }

    // Only allow approval of pending bookings
    if (booking.status !== 'pending') {
      req.flash('error', 'Only pending bookings can be approved');
      return res.redirect('/owner/dashboard');
    }

    booking.status = 'approved';
    await booking.save();
    req.flash('success', 'Booking approved!');
    res.redirect('/owner/dashboard');
  } catch (e) {
    next(e);
  }
};

// Owner reject a booking
module.exports.rejectBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash('error', 'Invalid booking');
      return res.redirect('/owner/dashboard');
    }

    const booking = await Booking.findById(id).populate('listing');
    if (!booking) {
      req.flash('error', 'Booking not found');
      return res.redirect('/owner/dashboard');
    }

    // Check if user owns the listing
    if (!booking.listing.owner || booking.listing.owner.toString() !== req.user._id.toString()) {
      req.flash('error', 'You do not own this listing');
      return res.redirect('/owner/dashboard');
    }

    // Only allow rejection of pending bookings
    if (booking.status !== 'pending') {
      req.flash('error', 'Only pending bookings can be rejected');
      return res.redirect('/owner/dashboard');
    }

    booking.status = 'rejected';
    await booking.save();
    req.flash('success', 'Booking rejected');
    res.redirect('/owner/dashboard');
  } catch (e) {
    next(e);
  }
};
