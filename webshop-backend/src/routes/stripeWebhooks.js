// src/routes/stripeWebhooks.js (ESM-safe: allows require() via createRequire)
import { createRequire } from "module";
const require = createRequire(import.meta.url);

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

// Optional: configure carrier names without code changes
// Example: BIGBUY_CARRIERS="standard shipping,gls,dpd,dhl,ups"
function getPreferredCarriers() {
  const raw = (process.env.BIGBUY_CARRIERS || "").trim();
  if (!raw) return ["standard shipping", "standard", "gls", "dpd", "dhl", "ups"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Send order to BigBuy
 * Returns: { success: boolean, data?: any, error?: any }
 */
async function sendOrderToBigBuy(order, bigBuyItems, customerDetails, shippingDetails) {
  try {
    if (!BIGBUY_API_KEY) {
      return { success: false, error: "BIGBUY_API_KEY is missing" };
    }

    if (!bigBuyItems || bigBuyItems.length === 0) {
      return { success: false, error: "No BigBuy items" };
    }

    const fullName = customerDetails?.name || "Customer";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;

    const preferredCarriers = getPreferredCarriers();

    const baseOrder = {
      internalReference: `ORDER_${order.id}`,
      language: "en",
      paymentMethod: "moneybox",
      // BigBuy requires carriers (your previous error proved this)
      carriers: preferredCarriers.map((name) => ({ name })),
      shippingAddress: {
        firstName,
        lastName,
        country: shippingDetails?.country || "HR",
        postcode: shippingDetails?.postal_code || "",
        town: shippingDetails?.city || "",
        address: shippingDetails?.line1 || "",
        phone: customerDetails?.phone || "000000000",
        email: customerDetails?.email || order.customerEmail || "",
        comment: "",
      },
      products: bigBuyItems.map((i) => ({
        reference: i.bigbuySku,
        quantity: i.quantity,
      })),
    };

    const headers = {
      Authorization: `Bearer ${BIGBUY_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 1) CHECK
    let checkRes;
    try {
      checkRes = await axios.post(
        `${BIGBUY_BASE_URL}/rest/order/check/multishipping.json`,
        { order: baseOrder },
        { headers }
      );
    } catch (err) {
      console.error("BigBuy error body:", err.response?.data || err.message);
      return { success: false, error: err.response?.data || err.message };
    }

    // If BigBuy returns structured errors inside 200 response:
    if (checkRes?.data?.errors?.length) {
      console.error("BigBuy CHECK errors:", checkRes.data.errors);
      return { success: false, error: checkRes.data.errors };
    }

    // 2) CREATE (multishipping)
    let createRes;
    try {
      createRes = await axios.post(
        `${BIGBUY_BASE_URL}/rest/order/create/multishipping.json`,
        { order: baseOrder },
        { headers }
      );
    } catch (err) {
      console.error("BigBuy error body:", err.response?.data || err.message);
      return { success: false, error: err.response?.data || err.message };
    }

    return { success: true, data: createRes.data };
  } catch (err) {
    console.error("❌ Error sending order to BigBuy:", err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Stripe Webhook
 */
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      endpointSecret
    );
  } catch (err) {
    try {
      posthog.capture({
        distinctId: "anonymous",
        event: "stripe_webhook_signature_failed",
        properties: { error: String(err?.message || err) },
      });
    } catch {}

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Only handle checkout completed
  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;

  try {
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items", "line_items.data.price.product"],
    });

    const customerDetails = session.customer_details || {};
    const shippingDetails = customerDetails.address || {};

    // ✅ Always build items (Prisma requires it in your schema)
    const items =
      fullSession?.line_items?.data?.map((li) => ({
        name: li.description,
        quantity: li.quantity ?? 0,
        price: ((li.amount_total ?? 0) / 100),
      })) || [];

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
          quantity: li.quantity ?? 1,
        });
      }
    }

    // Idempotent DB order
    let order = await prisma.order.findUnique({
      where: { stripeSessionId: session.id },
    });

    if (!order) {
      order = await prisma.order.create({
        data: {
          stripeSessionId: session.id,
          customerEmail: customerDetails.email || "unknown",
          customerName: customerDetails.name || "unknown",
          shippingAddress: shippingDetails,
          totalAmount: session.amount_total ?? 0,
          currency: session.currency || "eur",
          paymentStatus: session.payment_status || "paid",
          dropshipperStatus: "pending",
          items, // ✅ required
        },
      });

      try {
        posthog.capture({
          distinctId: session.id,
          event: "order_created_db",
          properties: { order_id: order.id },
        });
      } catch {}
    }

    // 🚚 Send to BigBuy
    const result = await sendOrderToBigBuy(order, bigBuyItems, customerDetails, shippingDetails);

    if (!result.success) {
      // Mark DB first (so retries don't keep trying blindly)
      await prisma.order.update({
        where: { id: order.id },
        data: {
          dropshipperStatus: "failed",
        },
      });

      // 💸 Refund (idempotent-ish: don't crash if already refunded)
      try {
        await stripe.refunds.create({
          payment_intent: session.payment_intent,
        });

        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "refunded" },
        });
      } catch (refundErr) {
        const code = refundErr?.code || refundErr?.raw?.code;
        if (code !== "charge_already_refunded") {
          throw refundErr; // real refund failure
        }
      }

      try {
        posthog.capture({
          distinctId: session.id,
          event: "order_refunded_bigbuy_failed",
          properties: {
            order_id: order.id,
            reason: result.error,
          },
        });
      } catch {}

      return res.status(200).json({ received: true });
    }

    // ✅ BigBuy success
    await prisma.order.update({
      where: { id: order.id },
      data: { dropshipperStatus: "sent" },
    });

    try {
      posthog.capture({
        distinctId: session.id,
        event: "bigbuy_order_sent",
        properties: { order_id: order.id, sandbox: BIGBUY_USE_SANDBOX },
      });
    } catch {}

    return res.status(200).json({ received: true });
  } catch (err) {
    try {
      posthog.capture({
        distinctId: session?.id || "unknown",
        event: "stripe_webhook_processing_failed",
        properties: { error: String(err?.message || err) },
      });
    } catch {}

    console.error("Webhook processing error:", err);
    return res.status(200).json({ received: true });
  }
});

export default router;
