// routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe requires the raw body for signature verification
router.post(
  "/",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle checkout session completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      try {
        // Extract user details from new API shape
        const customerEmail = session.customer_details?.email || "unknown";
        const shippingInfo =
          session.collected_information?.shipping_details ||
          session.customer_details;

        const shippingAddress = {
          name: shippingInfo?.name,
          line1: shippingInfo?.address?.line1,
          city: shippingInfo?.address?.city,
          postal_code: shippingInfo?.address?.postal_code,
          country: shippingInfo?.address?.country,
        };

        console.log("✅ Shipping info:", shippingAddress);

        // Retrieve line items
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const items = lineItems.data.map((item) => ({
          name: item.description,
          quantity: item.quantity,
          amount: item.amount_total / 100,
        }));

        // Save order to database
        const order = await prisma.order.create({
          data: {
            stripeSessionId: session.id,
            customerEmail,
            items,
            total: session.amount_total / 100,
            shippingAddress: shippingAddress,
            paymentStatus: session.payment_status,
          },
        });

        console.log("✅ Order saved to DB:", order.id);

        // --- SEND CONFIRMATION EMAIL ---
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const itemList = items
          .map(
            (i) =>
              `<li>${i.name} (x${i.quantity}) - €${i.amount.toFixed(2)}</li>`
          )
          .join("");

        const mailOptions = {
          from: `"Pluteo Webshop" <${process.env.EMAIL_USER}>`,
          to: customerEmail,
          subject: "Your Pluteo order confirmation",
          html: `
            <h2>Thank you for your purchase, ${shippingAddress.name}!</h2>
            <p>Your order has been received and is being processed.</p>
            <h3>Order Details</h3>
            <ul>${itemList}</ul>
            <p><strong>Total:</strong> €${(session.amount_total / 100).toFixed(
              2
            )}</p>
            <h3>Shipping Address</h3>
            <p>
              ${shippingAddress.name}<br>
              ${shippingAddress.line1}<br>
              ${shippingAddress.city}, ${shippingAddress.postal_code}<br>
              ${shippingAddress.country}
            </p>
            <p>We’ll notify you once your order has shipped.</p>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log("📧 Confirmation email sent to", customerEmail);
      } catch (err) {
        console.error("❌ Error handling checkout session:", err);
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
