const Listing=require("../models/Listing");


// utility used to escape user input when building a regex for Mongo
function escapeRegex(text) {
    // see https://stackoverflow.com/questions/3561493
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

module.exports.index = async (req, res) => {
    // support simple search via query parameter `search` (submitted from navbar)
    let allListings;
    const { search } = req.query;
    if (search) {
        const safe = escapeRegex(search);
        const regex = new RegExp(safe, 'i');
        // match title or location or country
        allListings = await Listing.find({
            $or: [
                { title: regex },
                { location: regex },
                { country: regex }
            ]
        });
    } else {
        allListings = await Listing.find({});
    }
    const categories = ["Trending","Rooms","Iconic Cities","Mountains","Castles","Camping","Farms","Arctic"];
    const listingsByCategory = {};
    categories.forEach(cat => listingsByCategory[cat] = []);
    allListings.forEach(listing => {
        const cat = listing.category || 'Trending';
        if(!listingsByCategory[cat]) listingsByCategory[cat] = [];
        listingsByCategory[cat].push(listing);
    });
    res.render("listings/index.ejs", { allListings, listingsByCategory, categories, search });
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

    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
    
    // Handle multiple image uploads
    if(req.files && req.files.length > 0) {
        newListing.images = req.files.map(file => ({
            url: file.path,
            filename: file.filename
        }));
        // Set the first image as the primary image
        newListing.image = {
            url: req.files[0].path,
            filename: req.files[0].filename
        };
    }
    
    await newListing.save();
    req.flash("success","New listing created with photos!");
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

    // Handle multiple image uploads
    if(req.files && req.files.length > 0) {
        listing.images = req.files.map(file => ({
            url: file.path,
            filename: file.filename
        }));
        // Update the primary image
        listing.image = {
            url: req.files[0].path,
            filename: req.files[0].filename
        };
        await listing.save();
    }

    req.flash("success","Listing updated with new photos!");
    res.redirect(`/listings/${id}`);
};


module.exports.destroyListing=async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    req.flash("success", "Listing deleted")
    res.redirect("/listings");
};