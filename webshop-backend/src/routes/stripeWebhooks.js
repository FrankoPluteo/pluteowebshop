// src/routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ✅ Webhook must receive raw body — NOT JSON parsed
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("🔔 Webhook received");

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      console.log("✅ Webhook signature verified");
    } catch (err) {
      console.error("⚠️ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("✅ Checkout session completed:", session.id);

      try {
        // Retrieve full session with line items
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items", "line_items.data.price.product"],
        });
        console.log("🔍 Full session retrieved");

        const customerDetails = session.customer_details || {};
        const shippingDetails = customerDetails.address || {};

        const items = fullSession.line_items.data.map((item) => ({
          name: item.description,
          quantity: item.quantity,
          price: item.amount_total / 100,
        }));

        // 💾 Save order in database
        const order = await prisma.order.create({
          data: {
            stripeSessionId: session.id,
            customerEmail: customerDetails.email || "unknown",
            customerName: customerDetails.name || "No name provided",
            shippingAddress: shippingDetails,
            totalAmount: session.amount_total,
            currency: session.currency,
            items,
            paymentStatus: session.payment_status || "pending",
          },
        });
        console.log("💾 Order saved to database:", order.id);

        // 📧 Send confirmation email using SendGrid
        const sgMail = require("@sendgrid/mail");
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        const msg = {
          to: customerDetails.email,
          from: process.env.FROM_EMAIL,
          subject: "Your Pluteo Order Confirmation",
          html: `
            <h2>Thank you for your order, ${customerDetails.name || "Customer"}!</h2>
            <p>We received your payment of <strong>${session.amount_total / 100} ${session.currency.toUpperCase()}</strong>.</p>

            <h3>Order summary:</h3>
            <ul>
              ${items
                .map(
                  (item) =>
                    `<li>${item.quantity}x ${item.name} - €${item.price.toFixed(2)}</li>`
                )
                .join("")}
            </ul>

            <h3>Shipping address:</h3>
            <p>
              ${shippingDetails.line1 || ""}<br>
              ${shippingDetails.city || ""}, ${shippingDetails.postal_code || ""}<br>
              ${shippingDetails.country || ""}
            </p>

            <p>You will receive another email once your order is shipped.</p>
          `,
        };

try {
  await sgMail.send(msg);
  console.log("📧 Confirmation email sent via SendGrid!");
} catch (error) {
  console.error("❌ SendGrid error:", error);
  if (error.response) {
    console.error(error.response.body);
  }
}

      } catch (err) {
        console.error("❌ Error processing checkout.session.completed:", err);
        return res.status(500).send("Internal Server Error");
      }
    } else {
      console.log("ℹ️ Webhook event ignored:", event.type);
    }

    res.json({ received: true });
  }
);

module.exports = router;
