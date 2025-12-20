const Booking = require('../models/Booking');

// we will get stripeClient from bookings controller's logic; require stripe only when key present
let stripeClient = null;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_...' && process.env.STRIPE_MOCK !== 'true') {
    try {
        stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
    } catch (err) {
        console.error('Stripe init error (webhook):', err && err.message ? err.message : err);
        stripeClient = null;
    }
}

module.exports.stripeWebhookHandler = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (process.env.STRIPE_MOCK === 'true') {
        // In mock mode, optionally accept a test payload with bookingId
        try {
            const raw = req.rawBody ? req.rawBody.toString() : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
            const parsed = JSON.parse(raw);
            if (parsed && parsed.type === 'checkout.session.completed' && parsed.data && parsed.data.object && parsed.data.object.metadata) {
                const bookingId = parsed.data.object.metadata.bookingId;
                const booking = await Booking.findById(bookingId);
                if (booking) {
                    booking.paid = true;
                    await booking.save();
                }
            }
            return res.status(200).send('ok');
        } catch (e) {
            console.error('Mock webhook parse error:', e.message);
            return res.status(400).send('invalid payload');
        }
    }

    if (!stripeClient) {
        console.error('Stripe client not configured for webhook');
        return res.status(500).send('Stripe not configured');
    }
    if (!webhookSecret) {
        console.error('Missing STRIPE_WEBHOOK_SECRET');
        return res.status(500).send('Webhook secret not set');
    }

    let event;
    try {
        const rawPayload = req.rawBody || req.body;
        event = stripeClient.webhooks.constructEvent(rawPayload, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            (async () => {
                try {
                    const session = event.data.object;
                    const bookingId = session.metadata && session.metadata.bookingId;
                    if (bookingId) {
                        const booking = await Booking.findById(bookingId);
                        if (booking) {
                            booking.paid = true;
                            await booking.save();
                            console.log('Booking marked paid via webhook:', bookingId);
                        }
                    }
                } catch (e) {
                    console.error('Error handling checkout.session.completed:', e);
                }
            })();
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
};
