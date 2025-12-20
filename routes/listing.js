const express = require("express");
const router = express.Router();
const wrapAsync = require('../utils/wrapAsync');
const Listing = require("../models/Listing.js");
const {isLoggedIn , isOwner ,validateListing, isOwnerRole, classifyCategoryMiddleware}=require("../middleware.js");

const listingController = require("../controllers/listing.js");
const multer = require('multer');

const {storage}=require("../cloudConfig.js");

const upload = multer({storage});


router.route("/")
.get(  wrapAsync(listingController.index)
)
.post(isLoggedIn, isOwnerRole, 
    upload.single('listing[image]'),
    classifyCategoryMiddleware,
    validateListing,
     wrapAsync(listingController.createListing)
    );





//new Route
router.get("/new",  isLoggedIn , isOwnerRole, listingController.renderNewForm);



router.route("/:id")
.get( wrapAsync(listingController.showListing)
)
.put(isLoggedIn,
    isOwner,
    upload.single('listing[image]'),
    classifyCategoryMiddleware,
    validateListing,
    wrapAsync(listingController.updateListing)
)
.delete(isLoggedIn, isOwner,
    wrapAsync(listingController.destroyListing)
);








//edit Route
router.get(
    "/:id/edit", 
    isLoggedIn, 
    isOwner,
    wrapAsync(listingController.renderEditForm)
);





module.exports = router;