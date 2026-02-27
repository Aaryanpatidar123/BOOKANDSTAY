const User = require("../models/user");

module.exports.renderSignupForm =  (req, res) => {
    const defaultRole = req.query.role === 'owner' ? 'owner' : (req.query.role === 'admin' ? 'admin' : 'user');
    res.render("users/signup.ejs", { defaultRole });
};


module.exports.signup = async (req, res) => {
    try {
        let { username, email, password, role, admin_code } = req.body;
        // keep role only as 'owner' or 'user' (admins are a flag)
        role = (role === 'owner') ? 'owner' : 'user';
        const isAdmin = ((req.body.role === 'admin') || (admin_code && admin_code === process.env.ADMIN_CODE)) ? true : false;
        
        // Check if email already registered
        const existing = await User.findOne({ email });
        if (existing) {
            req.flash('error', 'Email already in use. Please log in or use a different email.');
            return res.redirect('/signup');
        }
        
        // Create user directly without OTP verification
        const newUser = new User({ email, username, role, isAdmin: !!isAdmin });
        const registeredUser = await User.register(newUser, password);
        
        req.login(registeredUser, (err) => {
            if (err) {
                req.flash('error', 'Account created but login failed. Please log in manually.');
                return res.redirect('/login');
            }
            req.flash('success', 'Account created and you are now logged in!');
            res.redirect('/listings');
        });
    } catch (e) {
        console.error('Signup error:', e);
        req.flash('error', 'Signup failed. Please try again.');
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