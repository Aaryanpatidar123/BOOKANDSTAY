const express = require("express");
const router = express.Router();
const User = require("../models/user.js");
const wrapAsync = require("../utils/wrapAsync");
const passport = require("passport");
const { saveRedirectUrl, isLoggedIn } = require("../middleware.js");
const multer = require('multer');
const { storage } = require("../cloudConfig.js");

const upload = multer({ storage });

const userController = require("../controllers/users.js")


router.route("/signup")
.get( userController.renderSignupForm)
.post( wrapAsync(userController.signup));

router.route('/signup/verify')
.get(userController.renderOtpForm)
.post(wrapAsync(userController.verifyOtp));

router.post('/signup/resend', wrapAsync(userController.resendOtp));


router.route("/login")
.get( userController.renderLoginForm)
.post(
    saveRedirectUrl,
    passport.authenticate("local",
        {
            failureRedirect: "/login",
            failureFlash: true
        }),
        userController.login
    );



    router.get("/logout",userController.logout);

    // Profile route
    router.get('/profile', isLoggedIn, userController.renderProfile);
    
    // Edit profile routes
    router.get('/profile/edit', isLoggedIn, userController.renderEditProfile);
    router.post('/profile/edit', isLoggedIn, upload.single('profilePhoto'), wrapAsync(userController.updateProfile));

module.exports = router;
