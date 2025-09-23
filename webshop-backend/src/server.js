// webshop-backend/src/server.js
require("dotenv").config();
const app = require("./app");
const express = require('express');
const connectDB = require("./config/db");

// Define a function to start the server
const startServer = async () => {
  try {
    // Connect to MongoDB and wait for the connection to be established
    await connectDB();
    console.log("Database connection successful.");

    // IMPORTANT: Your webhook route MUST come FIRST
    const stripeWebhooks = require("./routes/stripeWebhooks");
    app.use("/api/stripe-webhooks", stripeWebhooks);

    // Now, you can add your other middleware like express.json()
    app.use(express.json());

    // Your regular Stripe routes
    const stripeRoutes = require("./routes/stripeRoutes");
    app.use("/api/stripe", stripeRoutes);

    // Your new Order routes
    const orderRoutes = require("./routes/orderRoutes"); // Import the new route
    app.use("/api/orders", orderRoutes); // Add the new base path for order routes

    const PORT = process.env.PORT || 3001;

    app.listen(PORT, () => {
      console.log(`✅ Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1); // Exit with a failure code
  }
};

// Call the async function to start the server
startServer();
