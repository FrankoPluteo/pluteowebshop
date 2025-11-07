// src/routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Invalid Stripe signature:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      try {
        // Retrieve line items (requires API call)
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 100 }
        );

        // Avoid duplicate orders
        const existing = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
        });

        if (existing) {
          console.log("⚠️ Order already exists:", existing.id);
          return res.json({ received: true });
        }

        // Create new order
        const newOrder = await prisma.order.create({
          data: {
            stripeSessionId: session.id,
            customerEmail: session.customer_details?.email || "unknown",
            customerName: session.customer_details?.name || null,
            shippingAddress: session.shipping_details?.address || {},
            totalAmount: session.amount_total / 100,
            currency: session.currency,
            items: lineItems.data.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unit_amount: item.price.unit_amount / 100,
              currency: item.price.currency,
            })),
            paymentStatus: session.payment_status,
          },
        });

        console.log("✅ Order saved:", newOrder.id);

        // --- Email sending ---
        try {
          const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
            connectionTimeout: 10000, // 10 seconds
          });

          const mailOptions = {
            from: `"Pluteo Webshop" <${process.env.EMAIL_USER}>`,
            to: newOrder.customerEmail,
            subject: "Your Pluteo Order Confirmation",
            html: `
              <h2>Thank you for your order, ${newOrder.customerName || "customer"}!</h2>
              <p><b>Total:</b> €${(newOrder.totalAmount).toFixed(2)}</p>
              <p>We’ll send you another email once your order ships.</p>
              <br/>
              <p>Kind regards,<br/><b>Pluteo Team</b></p>
            `,
          };

          await transporter.sendMail(mailOptions);
          console.log("📧 Email sent to:", newOrder.customerEmail);
        } catch (emailErr) {
          console.error("❌ Email failed:", emailErr.message);
        }

      } catch (err) {
        console.error("❌ Webhook handler error:", err);
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
