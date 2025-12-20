const mongoose = require('mongoose');
const initData = require('./data');
const Listing = require('../models/Listing');
 


 const MONGO_URL = "mongodb://127.0.0.1:27017/BOOK&STAY";

main().then(() => {
    console.log("conneted to DB");
   
})
    .catch((err) => {
        console.log(err);
    });

async function main() {
    
    await mongoose.connect(MONGO_URL);

}

const initDB = async () => {
     await Listing.deleteMany({});
    //  initData.data=initData.data.map((obj)=>({
    //     ...obj, 
    //     owner:"693d666be3b20a7cd7c4a9a7",
    // }));
     await Listing.insertMany(initData.data);
    console.log("data was initialized");
};

 initDB();




