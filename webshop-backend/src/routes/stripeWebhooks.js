// src/routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { PrismaClient } = require("@prisma/client");
import axios from "axios";

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
export async function sendOrderToBigBuy({
  orderId,
  customer,
  shipping,
  items,
}) {
  const BIGBUY_BASE = "https://api.bigbuy.eu/rest";
  const BIGBUY_TOKEN = process.env.BIGBUY_API_KEY;

  const headers = {
    Authorization: `Bearer ${BIGBUY_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  /* ----------------------------------------
   * STEP 1 — CHECK SHIPPING OPTIONS
   * -------------------------------------- */
  const checkPayload = {
    order: {
      internalReference: `ORDER_${orderId}`,
      language: "en",
      paymentMethod: "moneybox",
      shippingAddress: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        country: shipping.country,
        postcode: shipping.postcode,
        town: shipping.city,
        address: shipping.address,
        phone: shipping.phone || "000000000",
        email: customer.email,
      },
      products: items.map((i) => ({
        reference: i.bigbuySku,
        quantity: i.quantity,
      })),
    },
  };

  let checkResponse;
  try {
    checkResponse = await axios.post(
      `${BIGBUY_BASE}/order/check/multishipping.json`,
      checkPayload,
      { headers }
    );
  } catch (err) {
    console.error(
      "❌ BigBuy CHECK failed:",
      err.response?.data || err.message
    );
    throw new Error("BigBuy shipping check failed");
  }

  const shippingOptions =
    checkResponse.data?.orders?.[0]?.shippingOptions;

  if (!shippingOptions || shippingOptions.length === 0) {
    console.error("❌ No shipping options returned by BigBuy");
    throw new Error("No shipping options available");
  }

  // Prefer "Standard shipping" if present, otherwise first option
  const selectedCarrier =
    shippingOptions.find((o) =>
      o.name?.toLowerCase().includes("standard")
    ) || shippingOptions[0];

  if (!selectedCarrier?.id) {
    console.error("❌ Invalid carrier returned:", selectedCarrier);
    throw new Error("Invalid carrier selection");
  }

  /* ----------------------------------------
   * STEP 2 — CREATE ORDER
   * -------------------------------------- */
  const createPayload = {
    order: {
      internalReference: `ORDER_${orderId}`,
      language: "en",
      paymentMethod: "moneybox",
      carrier: { id: selectedCarrier.id },
      shippingAddress: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        country: shipping.country,
        postcode: shipping.postcode,
        town: shipping.city,
        address: shipping.address,
        phone: shipping.phone || "000000000",
        email: customer.email,
        comment: "",
      },
      products: items.map((i) => ({
        reference: i.bigbuySku,
        quantity: i.quantity,
      })),
    },
  };

  try {
    const createResponse = await axios.post(
      `${BIGBUY_BASE}/order/create.json`,
      createPayload,
      { headers }
    );

    console.log(
      "✅ BigBuy order created:",
      createResponse.data?.orders?.[0]?.reference
    );

    return createResponse.data;
  } catch (err) {
    console.error(
      "❌ BigBuy CREATE failed:",
      err.response?.data || err.message
    );
    throw new Error("BigBuy order creation failed");
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

      console.error("❌ Webhook processing failed:", err);
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

        const items =
          fullSession?.line_items?.data?.map((li) => ({
            name: li.description,
            quantity: li.quantity,
            price: (li.amount_total ?? 0) / 100,
          })) || [];

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
            items,
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
