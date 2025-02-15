const mongoose = require("mongoose");

// Type of order: buy or sell

const orderSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
    },
    quantity: {
        type: BigInt,
        required: true,
    },
    status: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        required: true,
    },
    recipient: {
        type: String,
        required: true,
    },
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
