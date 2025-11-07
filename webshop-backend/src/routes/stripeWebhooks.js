// src/routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ✅ Important: raw body middleware must be used
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ✅ Handle successful checkout
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      try {
        // 1️⃣ Save order in database
        const newOrder = await prisma.order.create({
          data: {
            stripeSessionId: session.id,
            customerEmail: session.customer_details.email,
            customerName: session.customer_details.name,
            shippingAddress: session.shipping_details?.address || {},
            totalAmount: session.amount_total / 100,
            currency: session.currency,
            items: session.display_items || [],
            paymentStatus: session.payment_status,
          },
        });

        console.log("✅ Order saved to DB:", newOrder.id);

        // 2️⃣ Send confirmation email
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const mailOptions = {
          from: `"Pluteo Webshop" <${process.env.EMAIL_USER}>`,
          to: newOrder.customerEmail,
          subject: "Your Pluteo Order Confirmation",
          html: `
            <h2>Thank you for your purchase, ${newOrder.customerName || "customer"}!</h2>
            <p>We’ve received your order successfully.</p>
            <p><b>Total:</b> €${(newOrder.totalAmount).toFixed(2)}</p>
            <p>We’ll notify you when your order is shipped.</p>
            <br/>
            <p>Kind regards,</p>
            <p><b>Pluteo Team</b></p>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log("📧 Confirmation email sent to:", newOrder.customerEmail);

      } catch (dbErr) {
        console.error("❌ Failed to process webhook:", dbErr);
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
