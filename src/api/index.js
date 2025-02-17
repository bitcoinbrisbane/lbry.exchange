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
    try {
        const orders = await Order.find({ status: "pending" })
            .sort({ date: -1 })
            .limit(50);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/price", (req, res) => {
    // Get the current price of LBRY
    res.json({
        price: 0.5
    });
});

app.post("/orders/buy", async (req, res) => {
    try {
        // Validate required fields
        if (!req.body.LBC_Address) {
            return res.status(400).json({ error: "LBC_Address is required" });
        }
        if (!req.body.quantity) {
            return res.status(400).json({ error: "quantity is required" });
        }

        const order = new Order({
            type: 'buyLBC',
            date: new Date(),
            status: 'pending',
            LBC_Address: req.body.LBC_Address,
            expiry: new Date(Date.now() + 1000 * 600), // 10 minutes
            quantity: req.body.quantity,
            price: req.body.price || null,
            USDC_Address: req.body.USDC_Address || null,  // not needed but we can get from matching up the open order with the incoming request
            LBC_Requested: req.body.quantity  // Required, same as quantity for buy orders
        });

        await order.save();
        res.json(order);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post("/orders/sell", async (req, res) => {
    try {
        const order = new Order({
            type: 'sellLBC',
            date: new Date(),
            status: 'pending',
            LBC_Address: req.body.LBC_Address,
            expiry: new Date(Date.now() + 1000 * 600), // 10 minutes
            quantity: req.body.quantity,
            price: req.body.price,
            USDC_Address: await getLbryDepositAddress(),
            LBC_Requested: req.body.quantity
        });

        await order.save();
        res.json(order);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update order status
app.put("/orders/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByIdAndUpdate(
            id,
            { status: req.body.status },
            { new: true }
        );
        
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        res.json(order);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
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
