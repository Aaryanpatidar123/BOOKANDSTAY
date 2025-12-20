const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require('../utils/wrapAsync');
const ExpressError = require("../utils/ExpressError.js");
const {  reviewSchema}=require("../schema.js");
const Review = require("../models/review.js");
const Listing = require("../models/Listing.js");
const{validateReview , isLoggedIn, isReviewAuther}=require("../middleware.js");

const reviewController = require("../controllers/reviews.js");



//Reviews 
// post route
router.post(
    "/" , 
    isLoggedIn,
    validateReview ,
    wrapAsync(reviewController.createReview));


//delete Review route
router.delete(
    "/:reviewId",
    isLoggedIn,
    isReviewAuther,
    wrapAsync(reviewController.destroyReview));

module.exports = router;