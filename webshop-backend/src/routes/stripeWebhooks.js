// src/routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ✅ PostHog (server-side)
const posthog = require("../posthogClient");

// BigBuy config
const BIGBUY_USE_SANDBOX = process.env.BIGBUY_USE_SANDBOX === "true";
const BIGBUY_API_KEY = BIGBUY_USE_SANDBOX
  ? process.env.BIGBUY_API_KEY_SANDBOX
  : process.env.BIGBUY_API_KEY_PROD;

const BIGBUY_BASE_URL = BIGBUY_USE_SANDBOX
  ? "https://api.sandbox.bigbuy.eu"
  : "https://api.bigbuy.eu";

/**
 * Send order to BigBuy
 * Returns: { success: boolean, error?: any }
 */
async function sendOrderToBigBuy(order, bigBuyItems, customerDetails, shippingDetails) {
  try {
    if (!bigBuyItems || bigBuyItems.length === 0) {
      posthog.capture({
        distinctId: order.stripeSessionId,
        event: "bigbuy_no_items",
        properties: { order_id: order.id },
      });
      return { success: false, error: "NO_ITEMS" };
    }

    const fullName = customerDetails.name || "Customer";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;

    const payload = {
      order: {
        internalReference: `ORDER_${order.id}`,
        language: "en",
        paymentMethod: "moneybox",
        shippingAddress: {
          firstName,
          lastName,
          country: shippingDetails.country,
          postcode: shippingDetails.postal_code,
          town: shippingDetails.city,
          address: shippingDetails.line1 || "",
          phone: customerDetails.phone || "000000000",
          email: customerDetails.email,
        },
        products: bigBuyItems.map((i) => ({
          reference: i.bigbuySku,
          quantity: i.quantity,
        })),
      },
    };

    const headers = {
      Authorization: `Bearer ${BIGBUY_API_KEY}`,
      "Content-Type": "application/json",
    };

    // 1️⃣ CHECK
    const checkRes = await axios.post(
      `${BIGBUY_BASE_URL}/rest/order/check/multishipping.json`,
      payload,
      { headers }
    );

    if (checkRes.data?.errors?.length) {
      posthog.capture({
        distinctId: order.stripeSessionId,
        event: "bigbuy_check_failed",
        properties: {
          order_id: order.id,
          errors: checkRes.data.errors,
        },
      });
      return { success: false, error: checkRes.data.errors };
    }

    // 2️⃣ CREATE
    const createRes = await axios.post(
      `${BIGBUY_BASE_URL}/rest/order/create/multishipping.json`,
      payload,
      { headers }
    );

    if (createRes.data?.errors?.length) {
      posthog.capture({
        distinctId: order.stripeSessionId,
        event: "bigbuy_create_failed",
        properties: {
          order_id: order.id,
          errors: createRes.data.errors,
        },
      });
      return { success: false, error: createRes.data.errors };
    }

    posthog.capture({
      distinctId: order.stripeSessionId,
      event: "bigbuy_order_sent",
      properties: {
        order_id: order.id,
        sandbox: BIGBUY_USE_SANDBOX,
      },
    });

    return { success: true };
  } catch (err) {
    posthog.capture({
      distinctId: order.stripeSessionId,
      event: "bigbuy_exception",
      properties: {
        order_id: order.id,
        error: String(err.response?.data || err.message),
      },
    });

    return { success: false, error: err };
  }
}

/**
 * Stripe Webhook
 */
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        endpointSecret
      );
    } catch (err) {
      posthog.capture({
        distinctId: "anonymous",
        event: "stripe_webhook_signature_failed",
        properties: { error: err.message },
      });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type !== "checkout.session.completed") {
      return res.json({ received: true });
    }

    const session = event.data.object;

    try {
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items", "line_items.data.price.product"],
      });

      const customerDetails = session.customer_details || {};
      const shippingDetails = customerDetails.address || {};

      // Build BigBuy items
      const bigBuyItems = [];
      for (const li of fullSession.line_items.data) {
        const productId = li.price?.product?.metadata?.productId;
        if (!productId) continue;

        const product = await prisma.products.findUnique({
          where: { id: Number(productId) },
        });

        if (product?.urllink) {
          bigBuyItems.push({
            bigbuySku: product.urllink,
            quantity: li.quantity,
          });
        }
      }

      // Idempotent order
      let order = await prisma.order.findUnique({
        where: { stripeSessionId: session.id },
      });

      if (!order) {
        order = await prisma.order.create({
          data: {
            stripeSessionId: session.id,
            customerEmail: customerDetails.email,
            customerName: customerDetails.name,
            shippingAddress: shippingDetails,
            totalAmount: session.amount_total,
            currency: session.currency,
            paymentStatus: session.payment_status,
            dropshipperStatus: "pending",
          },
        });

        posthog.capture({
          distinctId: session.id,
          event: "order_created_db",
          properties: { order_id: order.id },
        });
      }

      // 🚚 Send to BigBuy
      const result = await sendOrderToBigBuy(
        order,
        bigBuyItems,
        customerDetails,
        shippingDetails
      );

      if (!result.success) {
        // 💸 REFUND STRIPE
        await stripe.refunds.create({
          payment_intent: session.payment_intent,
        });

        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "refunded",
            dropshipperStatus: "failed",
          },
        });

        posthog.capture({
          distinctId: session.id,
          event: "order_refunded_bigbuy_failed",
          properties: {
            order_id: order.id,
            reason: result.error,
          },
        });

        return res.json({ received: true });
      }

      // ✅ Success
      await prisma.order.update({
        where: { id: order.id },
        data: { dropshipperStatus: "sent" },
      });

      return res.json({ received: true });
    } catch (err) {
      posthog.capture({
        distinctId: session.id,
        event: "stripe_webhook_processing_failed",
        properties: { error: String(err.message || err) },
      });

      console.error("Webhook processing error:", err);
      return res.status(200).json({ received: true });
    }
  }
);

module.exports = router;
