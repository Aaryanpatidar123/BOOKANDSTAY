const joi =  require("joi");

module.exports.listingSchema = joi.object({
    listing:joi.object({
        title:joi.string().required(),
        description:joi.string().required(),
        location:joi.string().required(),
        country:joi.string().required(),
        category:joi.string().valid('Trending','Rooms','Iconic Cities','Mountains','Castles','Camping','Farms','Arctic').required(),
        price:joi.number().required().min(0),
        image: joi.alternatives().try(
            joi.string().allow("", null),
            joi.object({
                filename: joi.string().allow("", null),
                url: joi.string().allow("", null)
            }).allow(null)
        )
        
    }).required(),
});

module.exports.reviewSchema = joi.object({
    review:joi.object({
rating:joi.number().required().min(1).max(5),
comment:joi.string().required(),
    }).required(),
});