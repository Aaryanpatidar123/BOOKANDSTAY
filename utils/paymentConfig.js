const Razorpay = require('razorpay');

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (keyId && keySecret) {
    try {
      return new Razorpay({ key_id: keyId, key_secret: keySecret });
    } catch (e) {
      console.error('Razorpay init error:', e && e.message ? e.message : e);
      return null;
    }
  }
  return null;
}

function isRazorConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

module.exports = { getRazorpayClient, isRazorConfigured };
