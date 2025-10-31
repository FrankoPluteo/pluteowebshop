// webshop-backend/src/routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// GET /api/orders/:sessionId
router.get("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    const order = await prisma.order.findUnique({
      where: { stripeSessionId: sessionId },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
