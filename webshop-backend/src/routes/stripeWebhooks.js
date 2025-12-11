// src/routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const axios = require("axios");

const BIGBUY_USE_SANDBOX = process.env.BIGBUY_USE_SANDBOX === "true";
const BIGBUY_API_KEY = BIGBUY_USE_SANDBOX
  ? process.env.BIGBUY_API_KEY_SANDBOX
  : process.env.BIGBUY_API_KEY_PROD;

const BIGBUY_BASE_URL = BIGBUY_USE_SANDBOX
  ? "https://api.sandbox.bigbuy.eu"
  : "https://api.bigbuy.eu";

async function sendOrderToBigBuy(order, bigBuyItems, customerDetails, shippingDetails) {
  try {
    if (!BIGBUY_API_KEY) {
      console.error("BigBuy API key is not configured");
      return;
    }

    if (!bigBuyItems || bigBuyItems.length === 0) {
      console.log("No BigBuy items to send for order", order.id);
      return;
    }

    const fullName = customerDetails.name || "Customer";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;

    const payload = {
      order: {
        internalReference: `ORDER_${order.id}`,
        language: "en",
        paymentMethod: "moneybox", // or your preferred method
        carriers: [
          { name: "gls" }, // adjust carrier if needed, must be valid in BigBuy
        ],
        shippingAddress: {
          firstName,
          lastName,
          country: shippingDetails.country,        // e.g. "HR"
          postcode: shippingDetails.postal_code,   // e.g. "10257"
          town: shippingDetails.city,              // e.g. "Zagreb"
          address: shippingDetails.line1 || "",
          phone: customerDetails.phone || "000000000",
          email: customerDetails.email,
          comment: "",
        },
        products: bigBuyItems.map((item) => ({
          reference: item.bigbuySku, // BigBuy SKU from product.urllink
          quantity: item.quantity,
        })),
      },
    };

    const headers = {
      Authorization: `Bearer ${BIGBUY_API_KEY}`,
      "Content-Type": "application/json",
    };

    console.log("Sending BigBuy CHECK payload:", JSON.stringify(payload, null, 2));

    // 1) Check order
    const checkRes = await axios.post(
      `${BIGBUY_BASE_URL}/rest/order/check/multishipping.json`,
      payload,
      { headers }
    );

    console.log("BigBuy CHECK response:", checkRes.data);

    if (checkRes.data.errors && checkRes.data.errors.length > 0) {
      console.error("BigBuy check errors:", checkRes.data.errors);
      await prisma.order.update({
        where: { id: order.id },
        data: { dropshipperStatus: "check_failed" },
      });
      return;
    }

    // 2) Create order
    const createRes = await axios.post(
      `${BIGBUY_BASE_URL}/rest/order/create/multishipping.json`,
      payload,
      { headers }
    );

    console.log("✅ BigBuy order created:", createRes.data);

    await prisma.order.update({
      where: { id: order.id },
      data: { dropshipperStatus: "sent" },
    });
  } catch (err) {
    console.error("❌ Error sending order to BigBuy:", err.response?.data || err.message);
    await prisma.order.update({
      where: { id: order.id },
      data: { dropshipperStatus: "error" },
    });
  }
}

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
        // Retrieve full session with line items AND price.product (for metadata)
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items", "line_items.data.price.product"],
        });

        const customerDetails = session.customer_details || {};
        const shippingDetails = customerDetails.address || {};

        const lineItems = fullSession.line_items.data;

        // Save items for your Order table + email
        const items = lineItems.map((item) => ({
          name: item.description,
          quantity: item.quantity,
          price: item.amount_total / 100,
        }));

        // 🔥 Build BigBuy items using product metadata added in stripeRoutes.js
        const bigBuyItems = [];
        for (const li of lineItems) {
          const productId = li.price?.product?.metadata?.productId;

          console.log("Line item in webhook:", {
            id: li.id,
            description: li.description,
            quantity: li.quantity,
            productIdFromMetadata: productId,
          });

          if (!productId) {
            console.warn("No productId metadata on line item", li.id);
            continue;
          }

          const product = await prisma.products.findUnique({
            where: { id: Number(productId) },
          });

          if (!product || !product.urllink) {
            console.warn(
              "Skipping BigBuy item – product or urllink missing for productId",
              productId
            );
            continue;
          }

          bigBuyItems.push({
            bigbuySku: product.urllink, // BigBuy SKU stored in urllink
            quantity: li.quantity,
          });
        }

        console.log("BigBuy items for this order:", bigBuyItems);

        // 💾 Save order in database
        // 💾 Find or create order in database (idempotent)
        let order = await prisma.order.findUnique({
          where: { stripeSessionId: session.id },
        });

        if (!order) {
          order = await prisma.order.create({
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
          console.log("💾 Order created in database:", order.id);
        } else {
          console.log("ℹ️ Order already exists in database:", order.id);
        }


        // 🔥 Send order to BigBuy (dropshipping)
        try {
          await sendOrderToBigBuy(order, bigBuyItems, customerDetails, shippingDetails);
        } catch (err) {
          console.error("Error calling sendOrderToBigBuy:", err);
        }

        // 📧 Send confirmation email using SendGrid (unchanged)
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
