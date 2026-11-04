require("dotenv").config();
const mongoose = require("mongoose");
const Quotation = require("./src/models/Quotation.model");

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("Database:", mongoose.connection.name);
        console.log("Collection:", Quotation.collection.name);
        console.log("Quotation count:", await Quotation.countDocuments());

        console.log(
            "Sample:",
            JSON.stringify(await Quotation.findOne().lean(), null, 2)
        );
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
})();