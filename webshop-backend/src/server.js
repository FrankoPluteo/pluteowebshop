require("dotenv").config();
const app = require("./app");
const express = require("express");

// ✅ PostHog client (server-side)
const posthog = require("./posthogClient");

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

    const PORT = process.env.PORT || 3001;
    const server = app.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });

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
