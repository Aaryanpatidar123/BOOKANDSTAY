const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const crypto = require('crypto');
const { getRazorpayClient, isRazorConfigured } = require('../utils/paymentConfig');
const axios = require('axios');
const emailer = require('../utils/email');

// Initialize Stripe client if a key is configured (avoid app crash when missing)
let stripeClient = null;
const isStripeMock = process.env.STRIPE_MOCK === 'true';
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_...' && !isStripeMock) {
    try {
        stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
    } catch (err) {
        // If require fails, leave stripeClient null and handle later
        console.error('Stripe init error:', err.message);
        stripeClient = null;
    }
} else {
    stripeClient = null;
}
if (isStripeMock) {
    console.warn('Running in STRIPE_MOCK mode: payments are simulated (no real charges).');
}



module.exports.renderNewBooking = async (req, res) => {
    const { listingId } = req.params;
    const listing = await Listing.findById(listingId);
    if(!listing) {
        req.flash('error','Listing not found');
        return res.redirect('/listings');
    }
    res.render('bookings/new', { listing });
};

module.exports.createCheckoutSession = async (req, res, next) => {
    try {
        const { listingId } = req.params;
        const { startDate, endDate } = req.body;
        const listing = await Listing.findById(listingId);
        if(!listing) return res.redirect('/listings');

        // Server-side parsing and validation to prevent past dates and tampering
        function parseLocalDateFromInput(input) {
            const [y, m, d] = input.split('-').map(Number);
            return new Date(y, m - 1, d);
        }

        const start = parseLocalDateFromInput(startDate);
        const end = parseLocalDateFromInput(endDate);

        // require start to be at least tomorrow (no past/today)
        const today = new Date();
        today.setHours(0,0,0,0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (start < tomorrow) {
            req.flash('error', 'Start date must be from tomorrow onwards.');
            return res.redirect(`/listings/${listing._id}`);
        }
        if (end <= start) {
            req.flash('error', 'End date must be after start date.');
            return res.redirect(`/listings/${listing._id}`);
        }

        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const nights = Math.max(1, Math.ceil((end - start) / MS_PER_DAY));
        const computedTotal = Number(listing.price) * nights;

        const booking = new Booking({
            listing: listing._id,
            user: req.user._id,
            startDate: start,
            endDate: end,
            totalPrice: computedTotal
        });
        await booking.save();

        // If dev mock enabled, simulate payment
        if (isStripeMock) {
            const mockSessionId = `mock_${booking._id}`;
            booking.stripeSessionId = mockSessionId;
            await booking.save();
            req.flash('info', 'Mock payment created (development only). Redirecting to success.');
            const successUrl = `${req.protocol}://${req.get('host')}/bookings/success?session_id=${mockSessionId}&bookingId=${booking._id}`;
            return res.redirect(303, successUrl);
        }

        // If Razorpay is configured, create an order and render a pay page
        const razorClientLocal = getRazorpayClient();
        const amountPaise = Math.round(booking.totalPrice * 100);
        if (razorClientLocal) {
            try {
                const order = await razorClientLocal.orders.create({
                    amount: amountPaise,
                    currency: 'INR',
                    receipt: booking._id.toString(),
                    payment_capture: 1
                });
                booking.razorpayOrderId = order.id;
                await booking.save();
                return res.render('bookings/pay', { booking, razorOrderId: order.id, razorKeyId: process.env.RAZORPAY_KEY_ID, amountPaise });
            } catch (err) {
                console.error('Razorpay order error:', err && err.message ? err.message : err);
                req.flash('error', 'Payment provider error: ' + (err && err.message ? err.message : 'Unknown error'));
                return res.redirect(`/listings/${listing._id}`);
            }
        } else {
            // Razorpay not configured - provide a safe mock flow for development
            const mockOrderId = `mock_rzp_order_${booking._id}`;
            booking.razorpayOrderId = mockOrderId;
            await booking.save();
            // Render pay page in mock mode; client will show a simulate-pay button
            return res.render('bookings/pay', { booking, razorOrderId: mockOrderId, isMock: true, amountPaise });
        }

        // Fallback: if Stripe not configured, show error
        if (!stripeClient) {
            req.flash('error','Payment gateway not configured. Please contact the site administrator.');
            return res.redirect(`/listings/${listing._id}`);
        }

        try {
            const session = await stripeClient.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: { name: `${listing.title} — Booking` },
                            unit_amount: Math.round(booking.totalPrice * 100)
                        },
                        quantity: 1
                    }
                ],
                mode: 'payment',
                success_url: `${req.protocol}://${req.get('host')}/bookings/success?session_id={CHECKOUT_SESSION_ID}&bookingId=${booking._id}`,
                cancel_url: `${req.protocol}://${req.get('host')}/bookings/${booking._id}`,
                metadata: { bookingId: booking._id.toString() }
            });

            booking.stripeSessionId = session.id;
            await booking.save();

            res.redirect(303, session.url);
        } catch (err) {
            console.error('Stripe checkout error:', err && err.message ? err.message : err);
            req.flash('error', 'Payment provider error: ' + (err && err.message ? err.message : 'Unknown error'));
            return res.redirect(`/listings/${listing._id}`);
        }
    } catch (e) {
        next(e);
    }
};

module.exports.success = async (req, res, next) => {
    try {
        const { bookingId, session_id } = req.query;
        const booking = await Booking.findById(bookingId).populate('listing');
        if(!booking) return res.redirect('/listings');

        // If webhook already marked booking as paid, show success immediately
        if (booking.paid) {
            req.flash('success', 'Payment successful — booking confirmed');
            return res.render('bookings/success', { booking });
        }

        // If this was a Stripe flow, keep the existing verification
        if(session_id && booking.stripeSessionId === session_id) {
            if (stripeClient) {
                try {
                    const session = await stripeClient.checkout.sessions.retrieve(booking.stripeSessionId);
                    if (session && session.payment_status === 'paid') {
                        booking.paid = true;
                        await booking.save();
                        // send confirmation email
                        const populatedBooking = await booking.populate([{ path: 'user' }, { path: 'listing' }]);
                        await emailer.sendBookingConfirmation(populatedBooking);
                        req.flash('success','Payment verified — booking confirmed');
                        return res.render('bookings/success', { booking });
                    }
                } catch (err) {
                    console.error('Stripe retrieve session error in success:', err && err.message ? err.message : err);
                }
            }
            req.flash('info','Payment initiated — awaiting confirmation. You will be redirected when it completes.');
            return res.redirect(`/bookings/${booking._id}`);
        }

        // If Razorpay order id present but booking not paid, prompt the user to complete payment
        if (booking.razorpayOrderId && !booking.paid) {
            req.flash('info','Payment initiated — please complete payment.');
            return res.redirect(`/bookings/${booking._id}`);
        }

        // verify via Stripe API as fallback (non-session path)
        if (isStripeMock) {
            if (booking.stripeSessionId && booking.stripeSessionId.startsWith('mock_')) {
                booking.paid = true;
                await booking.save();
                const populatedBooking = await booking.populate([{ path: 'user' }, { path: 'listing' }]);
                await emailer.sendBookingConfirmation(populatedBooking);
                req.flash('success','(Mock) Payment successful — booking confirmed');
                return res.render('bookings/success', { booking });
            }
            req.flash('error','(Mock) Payment session not found');
            return res.redirect(`/bookings/${booking._id}`);
        }

        if (!stripeClient) {
            req.flash('error','Payment provider not configured. Could not verify payment.');
            return res.redirect(`/bookings/${booking._id}`);
        }
        try {
            const session = await stripeClient.checkout.sessions.retrieve(booking.stripeSessionId);
            if(session && session.payment_status === 'paid') {
                booking.paid = true;
                await booking.save();
                req.flash('success','Payment verified — booking confirmed');
                return res.render('bookings/success', { booking });
            }
            req.flash('error','Payment not completed');
            res.redirect(`/bookings/${booking._id}`);
        } catch (err) {
            console.error('Stripe retrieve session error:', err && err.message ? err.message : err);
            req.flash('error','Could not verify payment: ' + (err && err.message ? err.message : 'Unknown error'));
            return res.redirect(`/bookings/${booking._id}`);
        }
    } catch (e) {
        next(e);
    }
};

module.exports.show = async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('listing').populate('user');
    if(!booking) {
        req.flash('error','Booking not found');
        return res.redirect('/listings');
    }
    // pass mock flag to view so we can show a dev payment button when enabled
    const isStripeMockLocal = process.env.STRIPE_MOCK === 'true';
    res.render('bookings/show', { booking, isStripeMock: isStripeMockLocal });
};

// Dev-only: mark a booking paid (only allowed when STRIPE_MOCK=true)
module.exports.markPaid = async (req, res, next) => {
    try {
        if (process.env.STRIPE_MOCK !== 'true') {
            req.flash('error','Operation not allowed: mock-mode is disabled');
            return res.redirect(`/bookings/${req.params.id}`);
        }
        const booking = await Booking.findById(req.params.id);
        if(!booking) {
            req.flash('error','Booking not found');
            return res.redirect('/listings');
        }
                booking.paid = true;
                await booking.save();
                const populatedBooking = await booking.populate([{ path: 'user' }, { path: 'listing' }]);
                await emailer.sendBookingConfirmation(populatedBooking);
        req.flash('success','(Mock) Payment successful — booking confirmed');
        res.redirect(`/bookings/${booking._id}`);
    } catch (e) {
        next(e);
    }
};

// Render pay page for existing booking (Razorpay)
module.exports.renderPayPage = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('listing');
        if(!booking) {
            req.flash('error','Booking not found');
            return res.redirect('/listings');
        }
        if(booking.paid) {
            req.flash('success','Booking already paid');
            return res.redirect(`/bookings/${booking._id}`);
        }
        // Ensure the logged in user owns the booking
        if (!req.user || booking.user.toString() !== req.user._id.toString()) {
            req.flash('error','You are not authorized to pay for this booking');
            return res.redirect('/listings');
        }
        const razorClientLocal = getRazorpayClient();
        // Ensure the logged in user owns the booking
        if (!req.user || booking.user.toString() !== req.user._id.toString()) {
            req.flash('error','You are not authorized to pay for this booking');
            return res.redirect('/listings');
        }
        const amountPaise = Math.round(booking.totalPrice * 100);
        if (!razorClientLocal) {
            // Render mock pay page so devs can simulate payment without real keys
            const mockOrderId = `mock_rzp_order_${booking._id}`;
            booking.razorpayOrderId = mockOrderId;
            await booking.save();
            return res.render('bookings/pay', { booking, razorOrderId: mockOrderId, isMock: true, amountPaise });
        }
        const order = await razorClientLocal.orders.create({ amount: amountPaise, currency: 'INR', receipt: booking._id.toString(), payment_capture: 1 });
        booking.razorpayOrderId = order.id;
        await booking.save();
        res.render('bookings/pay', { booking, razorOrderId: order.id, razorKeyId: process.env.RAZORPAY_KEY_ID, amountPaise });
    } catch (e) {
        next(e);
    }
};

// Verify Razorpay payment
module.exports.verifyPayment = async (req, res) => {
    try {
        const { id } = req.params; // booking id
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, mock } = req.body;
        console.log('verifyPayment called', { bookingId: id, user: req.user && req.user._id, mock, razorpay_order_id });
        const razorClientLocal = getRazorpayClient();

        // Support mock verification for development (no external calls)
        if (mock || !razorClientLocal) {
            console.log('Processing mock verification for booking', id);
            const booking = await Booking.findById(id);
            if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
            if (!req.user || booking.user.toString() !== req.user._id.toString()) {
                console.warn('verifyPayment unauthorized attempt', { bookingId: id, user: req.user && req.user._id });
                return res.status(403).json({ ok: false, error: 'Not authorized' });
            }
            booking.paid = true;
            await booking.save();
            const populatedBooking = await booking.populate([{ path: 'user' }, { path: 'listing' }]);
            await emailer.sendBookingConfirmation(populatedBooking);
            req.flash('success','(Mock) Payment successful — booking confirmed');
            return res.json({ ok: true, redirect: `/bookings/success?bookingId=${booking._id}` });
        }

        if (!process.env.RAZORPAY_KEY_SECRET) {
            console.error('Razorpay secret missing while attempting verification');
            return res.status(500).json({ ok: false, error: 'Payment verification misconfigured' });
        }

        const generated = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated !== razorpay_signature) {
            console.warn('Invalid signature for booking', id);
            return res.status(400).json({ ok: false, error: 'Invalid signature' });
        }

        const booking = await Booking.findById(id);
        if(!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
        if (!req.user || booking.user.toString() !== req.user._id.toString()) {
            console.warn('verifyPayment unauthorized attempt', { bookingId: id, user: req.user && req.user._id });
            return res.status(403).json({ ok: false, error: 'Not authorized' });
        }

        booking.paid = true;
        await booking.save();
        const populatedBooking = await booking.populate([{ path: 'user' }, { path: 'listing' }]);
        await emailer.sendBookingConfirmation(populatedBooking);
        req.flash('success','Payment successful — booking confirmed');
        return res.json({ ok: true, redirect: `/bookings/success?bookingId=${booking._id}` });

    } catch (e) {
        console.error('verifyPayment error:', e && e.message ? e.message : e);
        // Return JSON error rather than letting the global error handler render an HTML page
        return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
};

// Create PhonePe order (or mock) and return redirect info
module.exports.createPhonePeOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findById(id).populate('listing');
        if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found' });
        if (!req.user || booking.user.toString() !== req.user._id.toString()) return res.status(403).json({ ok: false, error: 'Not authorized' });

        const merchantId = process.env.PHONEPE_MERCHANT_ID;
        const secret = process.env.PHONEPE_SECRET_KEY;
        const amount = Math.round(booking.totalPrice * 100); // paise
        const transactionId = `txn_${booking._id}_${Date.now()}`;

        if (!merchantId || !secret) {
            // Mock behavior: return a simulated redirect to complete endpoint
            return res.json({ ok: true, mock: true, redirect: `/bookings/${booking._id}/phonepe/complete` });
        }

        const requestBody = {
            amount: amount,
            currency: 'INR',
            transactionId: transactionId,
            merchantId: merchantId,
            // additional fields may be required per PhonePe docs
            callbackUrl: `${req.protocol}://${req.get('host')}/bookings/${booking._id}/phonepe/complete`
        };

        try {
            const response = await axios.post('https://api.phonepe.com/apis/hermes/pg/create/payment', requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-VERIFY': secret
                }
            });
            // PhonePe may respond with a payment redirect or deep link in response.data
            const redirectUrl = response && response.data && response.data.redirectUrl ? response.data.redirectUrl : null;
            if (redirectUrl) {
                return res.json({ ok: true, redirect: redirectUrl });
            }
            // fallback - ensure we don't return undefined data
            return res.json({ ok: true, data: (response && response.data) || null });
        } catch (err) {
            console.error('PhonePe create order error:', err && err.message ? err.message : err);
            return res.status(500).json({ ok: false, error: 'PhonePe order creation failed' });
        }
    } catch (e) {
        next(e);
    }
};

// Complete PhonePe payment (mock or real webhook-driven flow)
module.exports.completePhonePe = async (req, res, next) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).send('Booking not found');
        // If real PhonePe callback, you should validate signature and payload. Here we allow dev mock.
        booking.paid = true;
        await booking.save();
        const populatedBooking = await booking.populate([{ path: 'user' }, { path: 'listing' }]);
        await emailer.sendBookingConfirmation(populatedBooking);
        req.flash('success', 'Payment successful — booking confirmed');
        // If JSON request, return JSON; otherwise redirect to success page
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
            return res.json({ ok: true, redirect: `/bookings/success?bookingId=${booking._id}` });
        }
        return res.redirect(`/bookings/success?bookingId=${booking._id}`);
    } catch (e) {
        next(e);
    }
};

