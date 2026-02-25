const User = require("../models/user");

module.exports.renderSignupForm =  (req, res) => {
    const defaultRole = req.query.role === 'owner' ? 'owner' : (req.query.role === 'admin' ? 'admin' : 'user');
    res.render("users/signup.ejs", { defaultRole });
};


const emailer = require('../utils/email');

function maskEmail(email) {
    const [local, domain] = email.split('@');
    const maskedLocal = local.length > 2 ? local[0] + '*'.repeat(Math.max(0, local.length - 2)) + local.slice(-1) : local[0] + '*';
    return `${maskedLocal}@${domain}`;
}

module.exports.signup = async (req, res) => {
    try {
        let { username, email, password, role, admin_code } = req.body;
        // keep role only as 'owner' or 'user' (admins are a flag)
        role = (role === 'owner') ? 'owner' : 'user';
        const isAdmin = ((req.body.role === 'admin') || (admin_code && admin_code === process.env.ADMIN_CODE)) ? true : false;
        // prevent sending OTP if email already registered
        const existing = await User.findOne({ email });
        if (existing) {
            req.flash('error', 'Email already in use. Please log in or use a different email.');
            return res.redirect('/signup');
        }
        // generate OTP and store pending registration in session for verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
        req.session.pendingRegistration = { username, email, password, role, isAdmin, otp, expiresAt };

        // Try to send OTP email to the user. Do NOT show the OTP on the verify page — OTP must be delivered to the user's email inbox.
        try {
            await emailer.sendOtpEmail(email, otp);
            req.flash('info', 'OTP sent to your email. Please check your inbox (and spam) and enter it to complete sign up.');
        } catch (e) {
            console.error('Signup OTP email send failed:', e && e.message ? e.message : e);
            // Do not display OTP on the verify page even in development. Instead, abort and require email delivery to proceed.
            delete req.session.pendingRegistration;
            req.flash('error', 'Could not send OTP to the provided email. Please configure email sending and try again.');
            return res.redirect('/signup');
        }
        return res.render('users/verify_otp', { emailMasked: maskEmail(email) });
    } catch (e) {
        console.error('Signup OTP error:', e);
        req.flash('error', 'Could not send OTP. Try again later.');
        res.redirect('/signup');
    }
};

module.exports.renderOtpForm = (req, res) => {
    const pending = req.session.pendingRegistration;
    if (!pending) {
        req.flash('error', 'No signup in progress. Please fill the signup form first.');
        return res.redirect('/signup');
    }
    res.render('users/verify_otp', { emailMasked: maskEmail(pending.email) });
};

module.exports.verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const pending = req.session.pendingRegistration;
        if (!pending) {
            req.flash('error', 'No signup in progress.');
            return res.redirect('/signup');
        }
        if (Date.now() > pending.expiresAt) {
            delete req.session.pendingRegistration;
            req.flash('error', 'OTP expired. Please sign up again to get a fresh code.');
            return res.redirect('/signup');
        }
        if (otp !== pending.otp) {
            req.flash('error', 'Incorrect OTP. Please try again.');
            return res.redirect('/signup/verify');
        }
        // OTP valid — create user
        const { username, email, password, role, isAdmin } = pending;
        const newUser = new User({ email, username, role, isAdmin: !!isAdmin });
        const registeredUser = await User.register(newUser, password);
        delete req.session.pendingRegistration;
        req.login(registeredUser, (err) => {
            if (err) {
                req.flash('success', 'Account created. Please log in.');
                return res.redirect('/login');
            }
            req.flash('success', 'Account created and you are now logged in.');
            res.redirect('/listings');
        });
    } catch (e) {
        console.error('OTP verification error:', e);
        req.flash('error', 'Could not verify OTP. Try again later.');
        res.redirect('/signup');
    }
};

module.exports.resendOtp = async (req, res) => {
    try {
        const pending = req.session.pendingRegistration;
        if (!pending) {
            req.flash('error', 'No signup in progress.');
            return res.redirect('/signup');
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        pending.otp = otp;
        pending.expiresAt = Date.now() + 10 * 60 * 1000;
        req.session.pendingRegistration = pending;
        try {
            await emailer.sendOtpEmail(pending.email, otp);
            req.flash('info', 'A new OTP has been sent to your email.');
        } catch (e) {
            console.error('Resend OTP email failed:', e && e.message ? e.message : e);
            // Do not show OTP on the page. Require a working email sender to resend.
            delete req.session.pendingRegistration;
            req.flash('error', 'Could not resend OTP. Please configure email sending and start signup again.');
            return res.redirect('/signup');
        }
        res.redirect('/signup/verify');
    } catch (e) {
        console.error('Resend OTP error:', e);
        req.flash('error', 'Could not resend OTP. Try again later.');
        res.redirect('/signup');
    }
};

module.exports.renderLoginForm = (req, res) => {
    const defaultRole = req.query.role === 'owner' ? 'owner' : (req.query.role === 'admin' ? 'admin' : 'user');
    res.render("users/login.ejs", { defaultRole });
};

module.exports.login = async (req, res) => {
        try {
            const chosenRole = req.body.role || 'user';
            if (!req.user) {
                req.flash('error', 'Login failed. Please try again.');
                return res.redirect('/login');
            }
            // Special handling for admin selection: check isAdmin flag instead of role field
            if (chosenRole === 'admin') {
                if (!req.user.isAdmin) {
                    req.logout(function(err){ if(err) console.error('Logout error after role mismatch:', err); });
                    req.flash('error', `You are not an admin. Please use the correct login option.`);
                    return res.redirect('/login');
                }
            } else {
                if (req.user.role !== chosenRole) {
                    // User logged in but selecting different role
                    req.logout(function(err){ if(err) console.error('Logout error after role mismatch:', err); });
                    req.flash('error', `You are not registered as '${chosenRole}'. Please use the correct login option.`);
                    return res.redirect('/login');
                }
            }
            req.flash("success", `Welcome back to BOOK&STAY — logged in as ${chosenRole}`);
            let redirectUrl = res.locals.redirectUrl || "/listings";
            res.redirect(redirectUrl);
        } catch (err) {
            console.error('Login handler error:', err && err.message ? err.message : err);
            req.flash('error', 'Login failed due to server error.');
            res.redirect('/login');
        }
    };


module.exports.logout = (req,res)=>{
        req.logout((err)=>{
            if(err){
                return next(err);
            }
            req.flash("success","you are loged out !");
            res.redirect("/listings");
        });
    };

module.exports.renderProfile = async (req, res, next) => {
    try {
        if (!req.user) {
            req.flash('error', 'Please log in to view your profile');
            return res.redirect('/login');
        }
        const user = await User.findById(req.user._id).lean();
        res.render('users/profile', { user });
    } catch (e) {
        next(e);
    }
};

module.exports.renderEditProfile = async (req, res, next) => {
    try {
        if (!req.user) {
            req.flash('error', 'Please log in to edit your profile');
            return res.redirect('/login');
        }
        const user = await User.findById(req.user._id).lean();
        res.render('users/edit-profile', { user });
    } catch (e) {
        next(e);
    }
};

module.exports.updateProfile = async (req, res, next) => {
    try {
        if (!req.user) {
            req.flash('error', 'Please log in to update your profile');
            return res.redirect('/login');
        }

        const { phone, bio, city, state } = req.body;
        const updateData = {
            phone: phone || '',
            bio: bio || '',
            city: city || '',
            state: state || ''
        };

        // Handle file upload if present
        if (req.file) {
            updateData.profilePhoto = {
                url: req.file.path,
                filename: req.file.filename
            };
        }

        const user = await User.findByIdAndUpdate(req.user._id, updateData, { new: true });
        req.user = user; // Update the session user object

        req.flash('success', 'Profile updated successfully!');
        res.redirect('/profile');
    } catch (e) {
        console.error('Profile update error:', e);
        next(e);
    }
};