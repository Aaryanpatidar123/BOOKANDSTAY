const nodemailer = require('nodemailer');
// sendgrid will be used if SENDGRID_API_KEY is provided in env
let sgMail;
if (process.env.SENDGRID_API_KEY) {
    try {
        sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        console.log('SendGrid configured');
    } catch (e) {
        console.warn('Failed to load @sendgrid/mail, falling back to nodemailer:', e.message || e);
        sgMail = null;
    }
}

const { getAuthUrl, loadSavedRefreshToken, createOAuth2Client } = require('./gmailOAuth');

async function createTransporter() {
    // OAuth2 via Google if client creds are present and a refresh token is available
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && (process.env.GOOGLE_REFRESH_TOKEN || loadSavedRefreshToken())) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || loadSavedRefreshToken();
        const user = process.env.SMTP_USER || process.env.EMAIL_FROM || null;
        if (!user) {
            console.warn('Google OAuth configured but SMTP user (sender) not set (SMTP_USER or EMAIL_FROM). Falling back to other methods.');
        } else {
            // Use googleapis to fetch an access token
            try {
                const { google } = require('googleapis');
                const oAuth2Client = createOAuth2Client(clientId, clientSecret, process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob');
                oAuth2Client.setCredentials({ refresh_token: refreshToken });
                const access = await oAuth2Client.getAccessToken();
                const accessToken = access && access.token ? access.token : null;
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        type: 'OAuth2',
                        user: user,
                        clientId,
                        clientSecret,
                        refreshToken,
                        accessToken,
                    }
                });
                try {
                    await transporter.verify();
                    console.log('✅ Gmail OAuth transporter verified for', user);
                } catch (err) {
                    console.warn('Warning: Gmail OAuth transporter verification failed:', err && err.message ? err.message : err);
                }
                return transporter;
            } catch (e) {
                console.warn('Google OAuth transporter setup failed:', e && e.message ? e.message : e);
            }
        }
    }

    // Prefer real SMTP from env when provided (App Password flow)
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        // Try to verify the transporter so issues are visible early
        try {
            await transporter.verify();
            console.log('SMTP transporter verified for', process.env.SMTP_USER);
        } catch (err) {
            console.warn('Warning: SMTP transporter verification failed:', err && err.message ? err.message : err);
        }
        return transporter;
    }
    // Fallback to Ethereal (dev) account when no SMTP configured
    const testAccount = await nodemailer.createTestAccount();
    console.log('No SMTP configured — using Ethereal test account. Preview URLs will be shown in console.');
    return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass
        }
    });
}

async function sendMail({ to, subject, text, html }) {
    // if SendGrid is configured, use it directly
    if (sgMail) {
        const from = process.env.EMAIL_FROM || 'no-reply@bookandstay.local';
        try {
            const msg = { to, from, subject, text, html };
            const [response] = await sgMail.send(msg);
            console.log('SendGrid message sent:', response && response.statusCode);
            return response;
        } catch (err) {
            console.error('SendGrid send error:', err && err.message ? err.message : err);
            // throw to allow caller to handle/resend
            throw err;
        }
    }
    // otherwise fall back to nodemailer transport
    try {
        const transporter = await createTransporter();
        // Prefer explicit EMAIL_FROM, else fall back to SMTP user for better deliverability when using Gmail
        const from = process.env.EMAIL_FROM || (process.env.SMTP_USER ? `${process.env.SMTP_USER}` : 'BOOK&STAY <no-reply@bookandstay.local>');

        const info = await transporter.sendMail({ from, to, subject, text, html });

        // Log delivery/acceptance info
        if (info && info.accepted && info.accepted.length > 0) {
            console.log(`Email accepted for delivery to: ${info.accepted.join(', ')} messageId=${info.messageId}`);
        }
        if (info && info.rejected && info.rejected.length > 0) {
            console.warn(`Email rejected for: ${info.rejected.join(', ')}`);
        }
        // If using ethereal, log preview URL for dev
        const preview = nodemailer.getTestMessageUrl(info);
        if (preview) {
            console.log('Preview email URL:', preview);
        }
        return info;
    } catch (err) {
        console.error('sendMail error:', err && err.message ? err.message : err);
        // Enhance message for common Gmail auth errors
        if (err && err.message && err.message.toLowerCase().includes('authentication')) {
            console.error('- Authentication failed. If using Gmail, enable 2FA and use an App Password as SMTP_PASS.');
        }
        throw err;
    }
}

async function sendOtpEmail(to, otp) {
    const subject = 'Your BOOK&STAY verification code (OTP)';
    const text = `Your verification code is ${otp}. It expires in 10 minutes.`;
    const html = `<p>Your verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`;
    return sendMail({ to, subject, text, html });
}

async function sendBookingConfirmation(booking) {
    try {
        // booking should be populated with user and listing
        const to = booking.user && booking.user.email ? booking.user.email : null;
        if (!to) return;
        const subject = `Booking confirmed — ${booking.listing.title}`;
        const text = `Your booking for ${booking.listing.title} from ${booking.startDate.toDateString()} to ${booking.endDate.toDateString()} is confirmed. Total: $${booking.totalPrice}. Booking id: ${booking._id}`;
        const html = `<p>Your booking for <strong>${booking.listing.title}</strong> from <strong>${booking.startDate.toDateString()}</strong> to <strong>${booking.endDate.toDateString()}</strong> is confirmed.</p>
                      <p><strong>Total paid:</strong> ₹${booking.totalPrice}</p>
                      <p>Booking id: ${booking._id}</p>`;
        return sendMail({ to, subject, text, html });
    } catch (err) {
        console.error('sendBookingConfirmation error:', err && err.message ? err.message : err);
    }
}

module.exports = { sendMail, sendOtpEmail, sendBookingConfirmation };