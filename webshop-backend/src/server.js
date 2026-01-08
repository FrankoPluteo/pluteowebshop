require("dotenv").config();
const app = require("./app");
const express = require("express");

// ✅ PostHog client (server-side)
const posthog = require("./posthogClient");

// ✅ Stock service
const { updateAllProductStock } = require("./services/bigbuyStockService");

const startServer = async () => {
  try {
    const stripeWebhooks = require("./routes/stripeWebhooks");

    // ✅ MUST be mounted BEFORE express.json() to keep raw body for Stripe signature verification
    app.use("/api/stripe-webhooks", stripeWebhooks);

    // Then enable json parsing for other routes
    app.use(express.json());

    const stripeRoutes = require("./routes/stripeRoutes");
    app.use("/api/stripe", stripeRoutes);

    const orderRoutes = require("./routes/orderRoutes");
    app.use("/api/orders", orderRoutes);

    // ✅ Stock routes
    const stockRoutes = require("./routes/stockRoutes");
    app.use("/api/stock", stockRoutes);

    const PORT = process.env.PORT || 3001;
    const server = app.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });

    // ✅ Initial stock sync on startup
    console.log("🔄 Performing initial stock sync...");
    updateAllProductStock()
      .then(result => {
        console.log(`✅ Initial stock sync complete: ${result.updated} products updated`);
      })
      .catch(err => {
        console.error("❌ Initial stock sync failed:", err.message);
      });

    // ✅ Schedule stock updates every 15 minutes (as recommended by BigBuy)
    const STOCK_UPDATE_INTERVAL = 15 * 60 * 1000; // 15 minutes
    
    setInterval(async () => {
      console.log("🔄 Scheduled stock update started...");
      try {
        const result = await updateAllProductStock();
        console.log(`✅ Scheduled stock update complete: ${result.updated} products updated`);
      } catch (err) {
        console.error("❌ Scheduled stock update failed:", err.message);
      }
    }, STOCK_UPDATE_INTERVAL);

    console.log(`⏰ Stock updates scheduled every ${STOCK_UPDATE_INTERVAL / 60000} minutes`);

    // ✅ Graceful shutdown: flush PostHog so you don't lose last events
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down...`);
      server.close(async () => {
        try {
          await posthog.shutdownAsync();
        } catch (e) {
          console.warn("PostHog shutdown failed:", e?.message || e);
        }
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();