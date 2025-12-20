const Listing = require("./models/Listing");
const Review = require("./models/review");
const ExpressError = require("./utils/ExpressError.js");
const { listingSchema ,reviewSchema}=require("./schema.js");
const { classifyCategory } = require("./utils/categoryClassifier");

// Middleware: auto-classify category from description when not provided or default
module.exports.classifyCategoryMiddleware = (req, res, next) => {
    if (req.body && req.body.listing) {
        const cat = req.body.listing.category;
        const desc = req.body.listing.description || '';
        if (!cat || (typeof cat === 'string' && (cat.trim() === '' || cat === 'Trending'))) {
            req.body.listing.category = classifyCategory(desc);
        }
    }
    next();
};

module.exports.isLoggedIn = (req,res,next)=>{
     if(!req.isAuthenticated()){
        if (req.session) {
            req.session.redirectUrl = req.originalUrl;
        } else {
            // Session is not available; provide a less stateful fallback by passing redirect in query
            console.warn('Session not available when saving redirectUrl; using query fallback');
        }
        req.flash("error","you must be logged in to create listing!");
       return res.redirect("/login");
    }
    next();
};

module.exports.saveRedirectUrl = (req,res,next)=>{
    if (req.session && req.session.redirectUrl) {
        res.locals.redirectUrl = req.session.redirectUrl;
        // Clear it after reading so it doesn't persist unexpectedly
        delete req.session.redirectUrl;
    }
    next();
};


module.exports.isOwner = async (req, res, next) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash('error', 'Listing not found');
    return res.redirect('/listings');
  }
  // Extract owner id whether it's populated (owner._id) or raw ObjectId/string (owner)
  const ownerId = listing.owner && listing.owner._id ? listing.owner._id : listing.owner;
  // Prefer req.user but fall back to res.locals.currUser if needed
  const userId = (req.user && req.user._id) ? req.user._id : (res.locals.currUser && res.locals.currUser._id ? res.locals.currUser._id : null);
  if (!userId || ownerId.toString() !== userId.toString()) {
    req.flash('error', 'You are not the owner of this listing');
    return res.redirect(`/listings/${id}`);
  }
  next();
};

// Ensure the logged-in user has role 'owner' to perform owner-only actions
module.exports.isOwnerRole = (req, res, next) => {
    if(!req.isAuthenticated() || !req.user || req.user.role !== 'owner'){
        req.flash('error', 'Only owners can perform that action');
        return res.redirect('/listings');
    }
    next();
};

module.exports.validateListing = (req,res,next)=>{
    let {error}=listingSchema.validate(req.body);
    if(error){
        let errMsg=error.details.map((el)=>el.message).join(",");
        throw new ExpressError(404,error);
    }else{
        next();
    }
};

module.exports.validateReview = (req,res,next)=>{
    let {error}=reviewSchema.validate(req.body);
    if(error){
        let errMsg=error.details.map((el)=>el.message).join(",");
        throw new ExpressError(404,error);
    }else{
        next();
    }
};

module.exports.isReviewAuther = async (req, res, next) => {
  const { id, reviewId } = req.params;
  const review = await Review.findById(reviewId);
  if (!review) {
    req.flash('error', 'Review not found');
    return res.redirect(`/listings/${id}`);
  }
  const autherId = review.auther && review.auther._id ? review.auther._id : review.auther;
  const userId = (req.user && req.user._id) ? req.user._id : (res.locals.currUser && res.locals.currUser._id ? res.locals.currUser._id : null);
  if (!userId || autherId.toString() !== userId.toString()) {
    req.flash('error', 'You are not the author of this review');
    return res.redirect(`/listings/${id}`);
  }
  next();
};