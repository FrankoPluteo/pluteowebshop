// webshop-backend/src/models/Order.js
const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
  stripeSessionId: {
    type: String,
    required: true,
    unique: true,
  },
  customerEmail: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
  },
  shippingAddress: {
    type: Object,
    required: true, // you insisted on making it required for dropshipping
  },
  totalAmount: {
    type: Number, // stored in cents
    required: true,
  },
  currency: {
    type: String,
    required: true,
  },
  items: [
    {
      description: String,
      quantity: Number,
      unit_amount: Number, // cents
      currency: String,
    },
  ],
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  dropshipperStatus: {
    type: String,
    enum: ['not_sent', 'sent', 'fulfilled', 'failed'],
    default: 'not_sent',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
