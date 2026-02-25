const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { default: passportLocalMongoose } = require("passport-local-mongoose");
const userSchema = new Schema({
    email:{
        type:String,
        required:true,
    },
    role: {
        type: String,
        enum: ['user', 'owner'],
        default: 'user'
    }
    ,
    isAdmin: {
        type: Boolean,
        default: false
    },
    profilePhoto: {
        url: String,
        filename: String
    },
    phone: String,
    bio: String,
    city: String,
    state: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

userSchema.plugin(passportLocalMongoose);
module.exports = mongoose.model("User", userSchema);