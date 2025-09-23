// webshop-backend/src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order'); // Import your Order model

// GET /api/orders/:sessionId
// Fetches a single order by its Stripe Session ID
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Find the order in your MongoDB database using the stripeSessionId
    const order = await Order.findOne({ stripeSessionId: sessionId });

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    // Send the order details back to the frontend
    res.status(200).json(order);

  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;/*  */