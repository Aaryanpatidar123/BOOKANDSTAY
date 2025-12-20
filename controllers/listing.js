const Listing=require("../models/Listing");


module.exports.index = async (req, res) => {
    const allListings = await Listing.find({});
    const categories = ["Trending","Rooms","Iconic Cities","Mountains","Castles","Camping","Farms","Arctic"];
    const listingsByCategory = {};
    categories.forEach(cat => listingsByCategory[cat] = []);
    allListings.forEach(listing => {
        const cat = listing.category || 'Trending';
        if(!listingsByCategory[cat]) listingsByCategory[cat] = [];
        listingsByCategory[cat].push(listing);
    });
    res.render("listings/index.ejs", { allListings, listingsByCategory, categories });
};


module.exports.renderNewForm = (req, res) => {
   
    res.render("listings/new.ejs");
};


module.exports.showListing = async (req, res) => {
    let { id } = req.params;
        const listing = await Listing.findById(id)
        .populate({
            path:"reviews",
        populate:{
            path:"auther",
        }
    })
        .populate("owner");
        if (!listing) {
            throw new ExpressError(404, 'Listing not found');
           
        }
        console.log(listing);
        res.render("listings/show.ejs", { listing });
};



module.exports.createListing=async (req, res, next) => {
    // enforce owner role as secondary check
    if(!req.user || req.user.role !== 'owner'){
        req.flash('error','Only owners can create listings');
        return res.redirect('/listings');
    }

    let url = req.file.path;
    let filename = req.file.filename;
    
   const newListing = new Listing(req.body.listing);
   newListing.owner = req.user._id;
   newListing.image = {url,filename};
    await newListing.save();
    req.flash("success","new listing created");
    res.redirect("/listings");
};


module.exports.renderEditForm = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if(!listing){
            throw new ExpressError(404, 'Listing not found');
    }

    
    res.render("listings/edit.ejs", { listing });
};


module.exports.updateListing =async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });

    if(typeof req.file !== "undefined"){
    let url = req.file.path;
    let filename = req.file.filename;
    listing.image = {url , filename};
    await listing.save();
    }

    req.flash("success","Listing updated");
    res.redirect(`/listings/${id}`);
};


module.exports.destroyListing=async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    req.flash("success", "Listing deleted")
    res.redirect("/listings");
};