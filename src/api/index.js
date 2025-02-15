const express = require("express");

const app = express();
app.use(express.json());

// Import the Order model
const Order = require("./models/order");

app.get("/", (req, res) => {
    res.send("Make lbry great again!");
});

// Create the db connection
const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/lbry", {

});

app.get("/orders", (req, res) => {
    // Get last 50 orders from the database, filter by status
    const orders = Order.find({ status: "active" })
        .sort({ date: -1 })
        .limit(50);

    // Send the orders as a response as JSON
    res.json(orders);
});

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
