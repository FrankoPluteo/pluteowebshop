const express = require("express");
const cors = require("cors");

const productRoutes = require("./routes/productRoutes");
const stripeWebhooksRoutes = require("./routes/stripeWebhooks"); // ✅ add this

const app = express();

app.use(cors());

app.use('/images', express.static('public/images'));

app.use("/products", productRoutes);

// ✅ mount Stripe webhooks (keep this route file using express.raw inside it)
app.use("/api/stripe-webhooks", stripeWebhooksRoutes);

module.exports = app;
