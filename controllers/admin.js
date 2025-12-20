const fs = require('fs');
const path = require('path');

// Dev-only: render a small page to configure payment env vars (RAZORPAY keys)
module.exports.renderPayConfig = (req, res) => {
  // Only allow in non-production environments
  if (process.env.NODE_ENV === 'production') {
    req.flash('error', 'Operation not allowed in production');
    return res.redirect('/');
  }
  // Must be logged in
  if (!req.user) {
    req.flash('error', 'You must be signed in to access this page');
    return res.redirect('/login');
  }
  const isRazorConfigured = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const isPhonePeConfigured = !!(process.env.PHONEPE_MERCHANT_ID && process.env.PHONEPE_SECRET_KEY);
  res.render('admin/pay-config', { isRazorConfigured, keyId: process.env.RAZORPAY_KEY_ID || '', isPhonePeConfigured, phonepeId: process.env.PHONEPE_MERCHANT_ID || '' });
};

function updateEnvFile(updates) {
  const envPath = path.join(process.cwd(), '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }
  // Ensure content ends with newline
  if (content && !content.endsWith('\n')) content += '\n';

  Object.keys(updates).forEach((k) => {
    const re = new RegExp('^' + k + '=.*$', 'm');
    const line = `${k}=${updates[k]}`;
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      content += line + '\n';
    }
  });
  fs.writeFileSync(envPath, content, 'utf8');
}

module.exports.postPayConfig = (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      req.flash('error', 'Operation not allowed in production');
      return res.redirect('/');
    }
    if (!req.user) {
      req.flash('error', 'You must be signed in to perform this action');
      return res.redirect('/login');
    }
    const { razor_id, razor_secret, phonepe_id, phonepe_secret } = req.body;
    if (razor_id || razor_secret) {
      if (!razor_id || !razor_secret) {
        req.flash('error', 'Both Razorpay Key ID and Key Secret are required');
        return res.redirect('/admin/pay-config');
      }
      updateEnvFile({ RAZORPAY_KEY_ID: razor_id.trim(), RAZORPAY_KEY_SECRET: razor_secret.trim() });
      process.env.RAZORPAY_KEY_ID = razor_id.trim();
      process.env.RAZORPAY_KEY_SECRET = razor_secret.trim();
      req.flash('success', 'Razorpay keys saved to .env (restart server if necessary)');
    }

    if (phonepe_id || phonepe_secret) {
      if (!phonepe_id || !phonepe_secret) {
        req.flash('error', 'Both PhonePe Merchant ID and Secret Key are required');
        return res.redirect('/admin/pay-config');
      }
      updateEnvFile({ PHONEPE_MERCHANT_ID: phonepe_id.trim(), PHONEPE_SECRET_KEY: phonepe_secret.trim() });
      process.env.PHONEPE_MERCHANT_ID = phonepe_id.trim();
      process.env.PHONEPE_SECRET_KEY = phonepe_secret.trim();
      req.flash('success', 'PhonePe keys saved to .env (restart server if necessary)');
    }

    res.redirect('/admin/pay-config');
  } catch (e) {
    next(e);
  }
};

// --- Email / Google OAuth helpers ---
const { getAuthUrl, getTokensFromCode, loadSavedRefreshToken } = require('../utils/gmailOAuth');
const { sendMail, sendOtpEmail } = require('../utils/email');

module.exports.renderEmailConfig = (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    req.flash('error', 'Operation not allowed in production');
    return res.redirect('/');
  }
  if (!req.user) {
    req.flash('error', 'You must be signed in to access this page');
    return res.redirect('/login');
  }
  res.render('admin/email-config', {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: process.env.SMTP_PORT || '',
    smtpUser: process.env.SMTP_USER || '',
    smtpSecure: process.env.SMTP_SECURE === 'true',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleHasRefresh: !!(process.env.GOOGLE_REFRESH_TOKEN || loadSavedRefreshToken()),
  });
};

module.exports.postEmailConfig = (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      req.flash('error', 'Operation not allowed in production');
      return res.redirect('/');
    }
    if (!req.user) {
      req.flash('error', 'You must be signed in to perform this action');
      return res.redirect('/login');
    }
    const { smtp_host, smtp_port, smtp_user, smtp_secure, smtp_pass, google_client_id, google_client_secret } = req.body;
    if (smtp_host || smtp_port || smtp_user || smtp_secure || smtp_pass) {
      if (!smtp_host || !smtp_port || !smtp_user || !smtp_pass) {
        req.flash('error', 'All SMTP fields are required to configure App Password flow');
        return res.redirect('/admin/email-config');
      }
      updateEnvFile({ SMTP_HOST: smtp_host.trim(), SMTP_PORT: smtp_port.trim(), SMTP_USER: smtp_user.trim(), SMTP_SECURE: smtp_secure === 'on' ? 'true' : 'false', SMTP_PASS: smtp_pass.trim() });
      process.env.SMTP_HOST = smtp_host.trim();
      process.env.SMTP_PORT = smtp_port.trim();
      process.env.SMTP_USER = smtp_user.trim();
      process.env.SMTP_SECURE = smtp_secure === 'on' ? 'true' : 'false';
      process.env.SMTP_PASS = smtp_pass.trim();
      req.flash('success', 'SMTP (App Password) settings saved to .env');
    }
    if (google_client_id || google_client_secret) {
      if (!google_client_id || !google_client_secret) {
        req.flash('error', 'Both Google Client ID and Client Secret are required');
        return res.redirect('/admin/email-config');
      }
      updateEnvFile({ GOOGLE_CLIENT_ID: google_client_id.trim(), GOOGLE_CLIENT_SECRET: google_client_secret.trim() });
      process.env.GOOGLE_CLIENT_ID = google_client_id.trim();
      process.env.GOOGLE_CLIENT_SECRET = google_client_secret.trim();
      req.flash('success', 'Google OAuth client saved to .env. Now click "Authorize Google" to complete setup.');
    }
    res.redirect('/admin/email-config');
  } catch (e) {
    next(e);
  }
};

module.exports.startGoogleAuth = (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    req.flash('error', 'Operation not allowed in production');
    return res.redirect('/');
  }
  if (!req.user) {
    req.flash('error', 'You must be signed in to perform this action');
    return res.redirect('/login');
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    req.flash('error', 'Google client ID/secret missing. Save them first on this page.');
    return res.redirect('/admin/email-config');
  }
  const redirectUri = `${req.protocol}://${req.get('host')}/admin/google-callback`;
  const url = getAuthUrl(clientId, clientSecret, redirectUri);
  res.redirect(url);
};

module.exports.googleCallback = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      req.flash('error', 'Operation not allowed in production');
      return res.redirect('/');
    }
    if (!req.user) {
      req.flash('error', 'You must be signed in to perform this action');
      return res.redirect('/login');
    }
    const code = req.query.code;
    if (!code) {
      req.flash('error', 'No code returned from Google');
      return res.redirect('/admin/email-config');
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/admin/google-callback`;
    const tokens = await getTokensFromCode(clientId, clientSecret, redirectUri, code);
    if (tokens && tokens.refresh_token) {
      updateEnvFile({ GOOGLE_REFRESH_TOKEN: tokens.refresh_token });
      process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
      req.flash('success', 'Google refresh token saved — OAuth setup complete. You can now send emails via Gmail.');
    } else {
      req.flash('warning', 'Authorization succeeded but no refresh token was returned. If you used an existing consent, try removing prior consent and re-authorize with prompt=consent.');
    }
    res.redirect('/admin/email-config');
  } catch (e) {
    next(e);
  }
};

module.exports.sendTestMail = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      req.flash('error', 'Operation not allowed in production');
      return res.redirect('/');
    }
    if (!req.user) {
      req.flash('error', 'You must be signed in to perform this action');
      return res.redirect('/login');
    }
    const to = req.body.test_email;
    if (!to) {
      req.flash('error', 'Provide an email to send the test to');
      return res.redirect('/admin/email-config');
    }
    // Send a simple test message
    await sendMail({ to, subject: 'BOOK&STAY test email', text: 'This is a test email from BOOK&STAY to verify email delivery.' });
    req.flash('success', `Test email sent to ${to}. Check inbox/spam. If using Ethereal, preview will appear in server logs.`);
    res.redirect('/admin/email-config');
  } catch (e) {
    console.error('sendTestMail error:', e && e.message ? e.message : e);
    req.flash('error', 'Failed to send test email. See console for details.');
    res.redirect('/admin/email-config');
  }
};