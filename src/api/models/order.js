const mongoose = require("mongoose");

// Type of order: buy or sell

const orderSchema = new mongoose.Schema({
    type: {
        type: String,  // buyLBC or sellLBC
        required: true,
        enum: ['buyLBC', 'sellLBC']
    },
    quantity: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'filled', 'cancelled']
    },
    price: {
        type: Number,
        required: false,
    },
    date: {
        type: Date,
        required: true,
    },
    expiry: {
        type: Date,
        required: true
    },
    LBC_Address: {
        type: String,
        required: function() {
            return this.type === 'buyLBC'; // Only required for buy orders
        }
    },
    USDC_Address: {
        type: String,
        required: true
    },
    LBC_Requested: {
        type: Number,
        required: false,
    },
    USDC_Requested: {
        type: Number,
        required: false,
    },
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
