const Listing=require("../models/Listing");
const Review = require("../models/review");


module.exports.createReview = async(req,res)=>{
    let listing = await Listing.findById(req.params.id);
       if (!listing) {
           throw new ExpressError(404, 'Listing not found');
       }
    let newReview = new Review(req.body.review);
     newReview.auther = req.user._id;
     console.log(newReview)
    listing.reviews.push(newReview);
    await newReview.save();
    await listing.save();
    req.flash("success","new review created");
    res.redirect(`/listings/${listing._id}`);
};



module.exports.destroyReview=async (req,res)=>{
    let {id, reviewId}=req.params;
    await Listing.findByIdAndUpdate(id,{$pull:{reviews:reviewId}});
    await Review.findByIdAndDelete(reviewId);
    req.flash("success","review deleted");
    res.redirect(`/listings/${id}`);
};