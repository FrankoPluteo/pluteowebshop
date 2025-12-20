// src/routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const axios = require("axios");

// ✅ PostHog (server-side)
const posthog = require("../posthogClient");

const BIGBUY_USE_SANDBOX = process.env.BIGBUY_USE_SANDBOX === "true";
const BIGBUY_API_KEY = BIGBUY_USE_SANDBOX
  ? process.env.BIGBUY_API_KEY_SANDBOX
  : process.env.BIGBUY_API_KEY_PROD;

const BIGBUY_BASE_URL = BIGBUY_USE_SANDBOX
  ? "https://api.sandbox.bigbuy.eu"
  : "https://api.bigbuy.eu";

/**
 * Fetch available carriers for a product from BigBuy
 */
async function getAvailableCarriers(bigbuySku, country, postalCode) {
  try {
    const headers = {
      Authorization: `Bearer ${BIGBUY_API_KEY}`,
      "Content-Type": "application/json",
    };

    const response = await axios.get(
      `${BIGBUY_BASE_URL}/rest/shipping/carriers.json`,
      {
        headers,
        params: {
          isoCountry: country,
          postalCode: postalCode,
        },
      }
    );

    console.log(`Available carriers for destination ${country}:`, JSON.stringify(response.data, null, 2));
    
    // Filter out carriers that exclude this product
    const availableCarriers = response.data.filter(carrier => {
      // Check if product is excluded
      if (carrier.excludedProductReferences && carrier.excludedProductReferences.includes(bigbuySku)) {
        console.log(`Carrier ${carrier.name} excludes product ${bigbuySku}`);
        return false;
      }
      
      // Check if carrier ships to this country
      if (carrier.shippingCountries) {
        const shipsToCountry = carrier.shippingCountries.some(
          c => c.isoCode === country || c.iso === country
        );
        if (!shipsToCountry) {
          console.log(`Carrier ${carrier.name} does not ship to ${country}`);
          return false;
        }
      }
      
      return true;
    });

    console.log(`Filtered available carriers:`, availableCarriers.map(c => c.name));
    
    return availableCarriers;
  } catch (err) {
    console.error("Error fetching carriers:", err.response?.data || err.message);
    return [];
  }
}

/**
 * Select the best available carrier (prioritize: gls > standard shipment > postal service > first available)
 */
function selectBestCarrier(carriers) {
  if (!carriers || carriers.length === 0) {
    console.warn("No carriers available, falling back to 'standard shipment'");
    return "standard shipment";
  }

  const priority = [
    "gls",
    "standard shipment", 
    "postal service",
    "ups",
    "dhl",
    "express"
  ];
  
  for (const preferred of priority) {
    const found = carriers.find(
      (c) => c.name.toLowerCase() === preferred
    );
    if (found) {
      console.log(`Selected carrier: ${found.name}`);
      return found.name.toLowerCase();
    }
  }

  console.log(`No priority carrier found, using first available: ${carriers[0].name}`);
  return carriers[0].name.toLowerCase();
}

/**
 * Send order to BigBuy (this does NOT charge Stripe - that happens after)
 */
async function sendOrderToBigBuy(order, bigBuyItems, customerDetails, shippingDetails) {
  try {
    // 🔥 SANDBOX BYPASS: If sandbox is broken, simulate success for testing
    if (BIGBUY_USE_SANDBOX && process.env.BIGBUY_SANDBOX_BYPASS === "true") {
      console.log("⚠️ SANDBOX BYPASS ENABLED - Simulating successful BigBuy order");
      
      await prisma.order.update({
        where: { id: order.id },
        data: { 
          dropshipperStatus: "sent_simulated",
          bigbuyOrderId: `MOCK_${order.id}_${Date.now()}`
        },
      });

      try {
        posthog.capture({
          distinctId: order?.stripeSessionId || String(order?.id || "unknown"),
          event: "bigbuy_order_simulated",
          properties: {
            order_id: order.id,
            stripe_session_id: order.stripeSessionId,
            note: "Sandbox bypass - BigBuy sandbox non-functional",
          },
        });
      } catch {}

      return { success: true, bigbuyOrderId: `MOCK_${order.id}` };
    }

    if (!BIGBUY_API_KEY) {
      console.error("BigBuy API key is not configured");

      try {
        posthog.capture({
          distinctId: order?.stripeSessionId || String(order?.id || "unknown"),
          event: "bigbuy_not_configured",
          properties: {
            order_id: order?.id,
            stripe_session_id: order?.stripeSessionId,
          },
        });
      } catch {}
      return { success: false, error: "BigBuy not configured" };
    }

    if (!bigBuyItems || bigBuyItems.length === 0) {
      console.log("No BigBuy items to send for order", order.id);

      try {
        posthog.capture({
          distinctId: order?.stripeSessionId || String(order?.id || "unknown"),
          event: "bigbuy_no_items",
          properties: {
            order_id: order?.id,
            stripe_session_id: order?.stripeSessionId,
          },
        });
      } catch {}
      return { success: false, error: "No BigBuy items" };
    }

    const fullName = customerDetails.name || "Customer";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;

    // 🔥 Get available carriers dynamically
    const carriers = await getAvailableCarriers(
      bigBuyItems[0].bigbuySku,
      shippingDetails.country,
      shippingDetails.postal_code
    );

    const selectedCarrier = selectBestCarrier(carriers);
    console.log(`Selected carrier: ${selectedCarrier}`);

    // Format phone number properly (BigBuy might require international format)
    let phone = customerDetails.phone || "+385912345678"; // Default Croatian number
    if (phone && !phone.startsWith("+")) {
      // Add country code if missing
      const countryPhonePrefixes = {
        HR: "+385",
        ES: "+34",
        DE: "+49",
        FR: "+33",
        IT: "+39",
        GB: "+44",
        US: "+1",
      };
      const prefix = countryPhonePrefixes[shippingDetails.country] || "+385";
      phone = prefix + phone.replace(/^0+/, ""); // Remove leading zeros
    }

    const payload = {
      order: {
        internalReference: `ORDER_${order.id}`,
        language: "en",
        paymentMethod: "moneybox",
        carriers: [{ name: selectedCarrier }],
        shippingAddress: {
          firstName,
          lastName,
          country: shippingDetails.country,
          postcode: shippingDetails.postal_code,
          town: shippingDetails.city,
          address: shippingDetails.line1 || "",
          phone: phone,
          email: customerDetails.email,
          comment: "",
        },
        products: bigBuyItems.map((item) => ({
          reference: item.bigbuySku,
          quantity: item.quantity,
        })),
      },
    };

    const headers = {
      Authorization: `Bearer ${BIGBUY_API_KEY}`,
      "Content-Type": "application/json",
    };

    console.log("Sending BigBuy CHECK payload:", JSON.stringify(payload, null, 2));

    // 1) Check order first
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

      try {
        posthog.capture({
          distinctId: order?.stripeSessionId || String(order?.id || "unknown"),
          event: "bigbuy_check_failed",
          properties: {
            order_id: order.id,
            stripe_session_id: order.stripeSessionId,
            errors: checkRes.data.errors,
          },
        });
      } catch {}

      return { success: false, error: checkRes.data.errors };
    }

    // 2) Create order (charges BigBuy wallet)
    const createRes = await axios.post(
      `${BIGBUY_BASE_URL}/rest/order/create/multishipping.json`,
      payload,
      { headers }
    );

    console.log("✅ BigBuy order created:", createRes.data);

    await prisma.order.update({
      where: { id: order.id },
      data: { 
        dropshipperStatus: "sent",
        bigbuyOrderId: String(createRes.data.id || "")
      },
    });

    try {
      posthog.capture({
        distinctId: order?.stripeSessionId || String(order?.id || "unknown"),
        event: "bigbuy_order_sent",
        properties: {
          order_id: order.id,
          stripe_session_id: order.stripeSessionId,
          bigbuy_response: createRes.data,
          sandbox: BIGBUY_USE_SANDBOX,
          carrier: selectedCarrier,
        },
      });
    } catch {}

    return { success: true, bigbuyOrderId: createRes.data.id };
  } catch (err) {
    console.error("❌ Error sending order to BigBuy:", err.response?.data || err.message);

    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { dropshipperStatus: "error" },
      });
    } catch {}

    try {
      posthog.capture({
        distinctId: order?.stripeSessionId || String(order?.id || "unknown"),
        event: "bigbuy_order_error",
        properties: {
          order_id: order?.id,
          stripe_session_id: order?.stripeSessionId,
          error: String(err.response?.data || err.message),
          sandbox: BIGBUY_USE_SANDBOX,
        },
      });
    } catch {}

    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Send email notification
 */
async function sendEmail(to, subject, text) {
  try {
    const sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      text,
    };

    await sgMail.send(msg);
    console.log(`📧 Email sent to: ${to}`);
    return true;
  } catch (err) {
    console.error("❌ Error sending email:", err.message);
    return false;
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

      try {
        posthog.capture({
          distinctId: "anonymous",
          event: "stripe_webhook_signature_failed",
          properties: { error: String(err?.message || err) },
        });
      } catch {}

      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 🔥 MAIN WEBHOOK HANDLER
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("✅ Checkout session completed:", session.id);
      console.log("Payment status:", session.payment_status);

      try {
        posthog.capture({
          distinctId: session.id,
          event: "stripe_checkout_completed",
          properties: {
            stripe_session_id: session.id,
            amount_total: session.amount_total,
            currency: session.currency,
            payment_status: session.payment_status,
          },
        });
      } catch {}

      try {
        // Retrieve full session with line items and payment intent
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items", "line_items.data.price.product", "payment_intent"],
        });

        const paymentIntent = fullSession.payment_intent;
        
        console.log("💳 Payment Intent details:", {
          id: paymentIntent?.id,
          status: paymentIntent?.status,
          capture_method: paymentIntent?.capture_method,
          amount: paymentIntent?.amount,
        });

        // ✅ Verify it's manual capture
        if (paymentIntent?.capture_method !== "manual") {
          console.error("⚠️ WARNING: Payment is not set to manual capture!");
          console.error("This means payment was already charged automatically.");
        }

        const customerDetails = session.customer_details || {};
        const shippingDetails = customerDetails.address || {};

        const lineItems = fullSession.line_items.data;

        // Save items for Order table
        const items = lineItems.map((item) => ({
          name: item.description,
          quantity: item.quantity,
          price: item.amount_total / 100,
        }));

        // 🔥 Build BigBuy items using product metadata
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
            bigbuySku: product.urllink,
            quantity: li.quantity,
          });
        }

        console.log("BigBuy items for this order:", bigBuyItems);

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
              paymentStatus: "authorized", // Payment authorized but not captured yet
            },
          });
          console.log("💾 Order created in database:", order.id);

          try {
            posthog.capture({
              distinctId: session.id,
              event: "order_created_db",
              properties: {
                order_id: order.id,
                stripe_session_id: session.id,
                total_amount: session.amount_total,
                currency: session.currency,
                items_count: items.reduce((a, i) => a + (i.quantity || 0), 0),
              },
            });
          } catch {}
        } else {
          console.log("ℹ️ Order already exists in database:", order.id);
        }

        // 🔥 STEP 1: Check if payment is authorized and ready
        if (!paymentIntent || paymentIntent.status !== "requires_capture") {
          console.error("❌ Payment Intent is not in 'requires_capture' state!");
          console.error("Current status:", paymentIntent?.status);
          
          await prisma.order.update({
            where: { id: order.id },
            data: { 
              paymentStatus: `error_${paymentIntent?.status || 'unknown'}`,
              dropshipperStatus: "payment_error"
            },
          });

          try {
            posthog.capture({
              distinctId: session.id,
              event: "payment_not_authorized",
              properties: {
                order_id: order.id,
                stripe_session_id: session.id,
                payment_status: paymentIntent?.status,
              },
            });
          } catch {}

          return res.status(200).json({ received: true, error: "Payment not authorized" });
        }

        console.log("✅ Payment is authorized and ready for capture");

        // 🔥 STEP 2: Send order to BigBuy FIRST (before capturing payment)
        console.log("🚀 Attempting to send order to BigBuy...");
        const bigbuyResult = await sendOrderToBigBuy(
          order, 
          bigBuyItems, 
          customerDetails, 
          shippingDetails
        );
        
        console.log("BigBuy result:", bigbuyResult);

        // 🔥 STEP 3: Handle based on BigBuy result
        if (!bigbuyResult.success) {
          // ❌ BigBuy failed - CANCEL the payment authorization
          console.error("❌ BigBuy order failed, canceling payment authorization...");

          try {
            await stripe.paymentIntents.cancel(paymentIntent.id);

            await prisma.order.update({
              where: { id: order.id },
              data: { 
                paymentStatus: "canceled",
                dropshipperStatus: "failed"
              },
            });

            console.log("✅ Stripe payment authorization canceled - customer NOT charged");

            try {
              posthog.capture({
                distinctId: session.id,
                event: "stripe_payment_canceled",
                properties: {
                  order_id: order.id,
                  stripe_session_id: session.id,
                  reason: "bigbuy_order_failed",
                  bigbuy_error: bigbuyResult.error,
                },
              });
            } catch {}

            // Send failure email
            await sendEmail(
              customerDetails.email,
              "Order Could Not Be Processed",
              `We're sorry, but we couldn't process your order due to availability issues.\n\nYour payment authorization has been canceled and no charge has been made to your card.\n\nOrder ID: ${order.id}\nAmount: €${session.amount_total / 100}\n\nIf you have any questions, please contact our support team.`
            );

            try {
              posthog.capture({
                distinctId: session.id,
                event: "order_cancellation_email_sent",
                properties: { 
                  stripe_session_id: session.id, 
                  to: customerDetails.email 
                },
              });
            } catch {}

          } catch (cancelErr) {
            console.error("❌ Error canceling payment:", cancelErr.message);

            await prisma.order.update({
              where: { id: order.id },
              data: { 
                paymentStatus: "cancel_failed",
                dropshipperStatus: "failed"
              },
            });

            try {
              posthog.capture({
                distinctId: session.id,
                event: "stripe_cancel_failed",
                properties: {
                  order_id: order.id,
                  stripe_session_id: session.id,
                  error: String(cancelErr?.message || cancelErr),
                },
              });
            } catch {}
          }

          return res.status(200).json({ received: true });
        }

        // ✅ STEP 4: BigBuy succeeded - CAPTURE the payment
        console.log("✅ BigBuy order successful, capturing payment...");

        try {
          await stripe.paymentIntents.capture(paymentIntent.id);

          await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: "paid" },
          });

          console.log("✅ Stripe payment captured successfully - customer charged");

          try {
            posthog.capture({
              distinctId: session.id,
              event: "stripe_payment_captured",
              properties: {
                order_id: order.id,
                stripe_session_id: session.id,
                amount: session.amount_total,
              },
            });
          } catch {}

        } catch (captureErr) {
          console.error("❌ Error capturing payment:", captureErr.message);

          await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: "capture_failed" },
          });

          try {
            posthog.capture({
              distinctId: session.id,
              event: "stripe_capture_failed",
              properties: {
                order_id: order.id,
                stripe_session_id: session.id,
                error: String(captureErr?.message || captureErr),
              },
            });
          } catch {}

          return res.status(200).json({ received: true });
        }

        // 📧 Send confirmation email
        const emailItems = items
          .map((i) => `• ${i.name} x${i.quantity} (€${i.price})`)
          .join("\n");

        await sendEmail(
          customerDetails.email,
          "Order Confirmation",
          `Thanks for your order!\n\nItems:\n${emailItems}\n\nTotal: €${session.amount_total / 100}\n\nWe will notify you when it ships.`
        );

        try {
          posthog.capture({
            distinctId: session.id,
            event: "order_confirmation_email_sent",
            properties: { 
              stripe_session_id: session.id, 
              to: customerDetails.email 
            },
          });
        } catch {}

      } catch (err) {
        console.error("❌ Error processing checkout.session.completed:", err);

        try {
          posthog.capture({
            distinctId: session?.id || "unknown",
            event: "stripe_webhook_processing_failed",
            properties: { error: String(err?.message || err) },
          });
        } catch {}
      }
    }

    res.status(200).json({ received: true });
  }
);

module.exports = router;