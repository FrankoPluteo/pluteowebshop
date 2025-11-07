require("dotenv").config();
const app = require("./app");
const express = require("express");

const startServer = async () => {
  try {
    const stripeWebhooks = require("./routes/stripeWebhooks");
    // Mount webhooks BEFORE json parsing
    app.use("/api/stripe-webhooks", stripeWebhooks);

    // Then enable json parsing for other routes
    app.use(express.json());

    const stripeRoutes = require("./routes/stripeRoutes");
    app.use("/api/stripe", stripeRoutes);

    const orderRoutes = require("./routes/orderRoutes");
    app.use("/api/orders", orderRoutes);

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
