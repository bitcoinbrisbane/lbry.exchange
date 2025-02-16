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

app.get("/orders", async (req, res) => {
    // Get last 50 orders from the database, filter by status
    const orders = await Order.find({ status: "active" })
        .sort({ date: -1 })
        .limit(50);

    // Send the orders as a response as JSON
    res.json(orders);
});

app.get("/price", (req, res) => {
    // Get the current price of LBRY
    res.json({
        price: 0.5
    });
});

app.post("/orders/buy", async (req, res) => {
    const address = await getLbryDepositAddress();

    // Create a new order
    const order = new Order({
        date: new Date(),
        status: "active",
        address,
        expiry: new Date(Date.now() + 1000 * 600), // 10 minutes from now
        ...req.body
    });

    // Save the order to the database
    await order.save();

    // Send the order as a response
    res.json(order);
});

app.post("/orders/sell", async (req, res) => {
    const address = await getLbryDepositAddress();

    // Create a new order
    const order = new Order({
        date: new Date(),
        status: "active",
        address,
        expiry: new Date(Date.now() + 1000 * 600), // 10 minutes from now
        ...req.body
    });

    // Save the order to the database
    await order.save();

    // Send the order as a response
    res.json(order);
});

// Poll this endpoint to get the balance of the deposit address
app.put("/orders/:id", async (req, res) => {
    // Get the order ID from the URL
    const { id } = req.params;

    // Find the order by ID
    const order = await Order.findById(id);

    // Get the deposit address
});

app.post("/bridge", async (req, res) => {
    const { address, amount } = req.body;

    // Send the LBRY to the user
    const tx = await sendLbry(address, amount);

    // Send the transaction as a response
    res.json(tx);
});

app.post("/swap", async (req, res) => {
});

const getLbryDepositAddress = async () => {
    return "bJxPoWWAttwnh3WR8fxJPguzeJ4mmk4n8o";
};

const getBalance = async (address) => {
    return 1000;
};

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
