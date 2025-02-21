const express = require("express");
const cors = require('cors');
const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://goldfish-app-wktcj.ondigitalocean.app',
        'https://lbry.exchange'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Import the Order model
const Order = require("./models/order");

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Make lbry great again!");
});

// Create the db connection
const mongoose = require("mongoose");

mongoose.connect("mongodb+srv://doadmin:2Ua58cXhE6940Te7@mongodb-database-lbry-99b4fc20.mongo.ondigitalocean.com/admin?tls=true&authSource=admin", {

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

// Initial rate: 1 USDC = 0.0035 LBC
let LBC_USDC_RATE = 0.0035;

// Function to get current rate
const getRate = () => {
    return LBC_USDC_RATE;
};



// Get current rate
app.get("/rate", (req, res) => {
    res.json({ 
        rate: getRate(),
        example: `1 USDC = ${getRate()} LBC`
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

        const currentRate = getRate();
        
        const order = new Order({
            type: 'buyLBC',
            date: new Date(),
            status: 'pending',
            LBC_Address: req.body.LBC_Address,
            expiry: new Date(Date.now() + 1000 * 600), // 10 minutes
            quantity: req.body.quantity,
            price: currentRate,
            USDC_Address: req.body.USDC_Address,
            LBC_Requested: req.body.quantity
        });

        await order.save();
        
        // Return order with rate information
        res.json({
            ...order.toJSON(),
            rate: currentRate,
            usdcNeeded: order.quantity / currentRate  // Calculate USDC needed
        });
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

app.get("/orders/:USDC_Address", async (req, res) => {
    try {
        const { USDC_Address } = req.params;
        
        // Find all orders for this USDC address
        const orders = await Order.find({ 
            USDC_Address: USDC_Address 
        }).sort({ date: -1 }); // Sort by date, newest first
        
        if (!orders || orders.length === 0) {
            return res.status(404).json({ 
                message: "No orders found for this address" 
            });
        }

        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ 
            error: "Failed to fetch orders" 
        });
    }
});

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
