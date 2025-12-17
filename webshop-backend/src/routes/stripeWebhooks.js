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

    // First, try to get carriers for the specific product
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
    return "standard shipment"; // fallback default
  }

  // Priority order (lowercase for BigBuy API)
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
      // Return lowercase carrier name for BigBuy API
      return found.name.toLowerCase();
    }
  }

  // If no priority match, return first available (lowercase)
  console.log(`No priority carrier found, using first available: ${carriers[0].name}`);
  return carriers[0].name.toLowerCase();
}

async function sendOrderToBigBuy(order, bigBuyItems, customerDetails, shippingDetails) {
  try {
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
          phone: customerDetails.phone || "000000000",
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

      // ✅ PostHog
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

    // ✅ PostHog
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

    // ✅ PostHog
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

      // ✅ PostHog
      try {
        posthog.capture({
          distinctId: "anonymous",
          event: "stripe_webhook_signature_failed",
          properties: { error: String(err?.message || err) },
        });
      } catch {}

      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("✅ Checkout session completed:", session.id);
      console.log("Payment status:", session.payment_status);

      // ✅ PostHog: stripe checkout completed (server-truth)
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
        // Retrieve full session with line items AND price.product (for metadata)
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items", "line_items.data.price.product", "payment_intent"],
        });

        console.log("Payment Intent details:", {
          id: fullSession.payment_intent?.id,
          status: fullSession.payment_intent?.status,
          capture_method: fullSession.payment_intent?.capture_method,
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
              paymentStatus: "authorized", // Payment authorized but not captured
            },
          });
          console.log("💾 Order created in database:", order.id);

          // ✅ PostHog
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

        // 🔥 STEP 1: Send order to BigBuy FIRST (charges BigBuy wallet)
        let bigbuyResult;
        try {
          console.log("🚀 Attempting to send order to BigBuy...");
          bigbuyResult = await sendOrderToBigBuy(order, bigBuyItems, customerDetails, shippingDetails);
          console.log("BigBuy result:", bigbuyResult);
        } catch (err) {
          console.error("Error calling sendOrderToBigBuy:", err);
          bigbuyResult = { success: false, error: err.message };

          try {
            posthog.capture({
              distinctId: session.id,
              event: "bigbuy_send_call_error",
              properties: {
                order_id: order?.id,
                stripe_session_id: session.id,
                error: String(err?.message || err),
              },
            });
          } catch {}
        }

        // Get payment intent details
        const paymentIntentId = fullSession.payment_intent?.id || session.payment_intent;
        let paymentIntent = fullSession.payment_intent;
        
        // If payment intent wasn't expanded, retrieve it
        if (typeof paymentIntent === 'string' || !paymentIntent?.status) {
          console.log("Retrieving payment intent separately...");
          paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        }

        console.log("Payment Intent Status:", paymentIntent?.status);
        console.log("Payment Intent Capture Method:", paymentIntent?.capture_method);

        // 🔥 STEP 2: If BigBuy order failed, handle payment appropriately
        if (!bigbuyResult.success) {
          console.error("❌ BigBuy order failed, handling payment...");

          try {
            if (paymentIntentId && paymentIntent) {
              console.log(`Payment Intent status: ${paymentIntent.status}`);

              if (paymentIntent.status === "requires_capture") {
                // Payment is authorized but not captured - cancel it
                await stripe.paymentIntents.cancel(paymentIntentId);

                await prisma.order.update({
                  where: { id: order.id },
                  data: { 
                    paymentStatus: "canceled",
                    dropshipperStatus: "failed"
                  },
                });

                console.log("✅ Stripe payment authorization canceled");

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
                const sgMail = require("@sendgrid/mail");
                sgMail.setApiKey(process.env.SENDGRID_API_KEY);

                const failMsg = {
                  to: customerDetails.email,
                  from: process.env.SENDGRID_FROM_EMAIL,
                  subject: "Order Could Not Be Processed",
                  text: `We're sorry, but we couldn't process your order due to availability issues.\n\nYour payment authorization has been canceled and no charge has been made to your card.\n\nOrder ID: ${order.id}\nAmount: €${session.amount_total / 100}\n\nIf you have any questions, please contact our support team.`,
                };

                await sgMail.send(failMsg);
                console.log("📧 Cancellation notification sent");
              } else if (paymentIntent.status === "succeeded") {
                // Payment was already captured - issue a refund
                console.log("⚠️ Payment already captured, issuing refund instead");

                const refund = await stripe.refunds.create({
                  payment_intent: paymentIntentId,
                  reason: "requested_by_customer",
                });

                await prisma.order.update({
                  where: { id: order.id },
                  data: { 
                    paymentStatus: "refunded",
                    dropshipperStatus: "failed",
                    stripeRefundId: refund.id,
                  },
                });

                console.log("✅ Stripe payment refunded:", refund.id);

                try {
                  posthog.capture({
                    distinctId: session.id,
                    event: "stripe_refund_issued",
                    properties: {
                      order_id: order.id,
                      stripe_session_id: session.id,
                      refund_id: refund.id,
                      reason: "bigbuy_order_failed_after_capture",
                      bigbuy_error: bigbuyResult.error,
                    },
                  });
                } catch {}

                // Send refund email
                const sgMail = require("@sendgrid/mail");
                sgMail.setApiKey(process.env.SENDGRID_API_KEY);

                const refundMsg = {
                  to: customerDetails.email,
                  from: process.env.SENDGRID_FROM_EMAIL,
                  subject: "Order Could Not Be Processed - Refund Issued",
                  text: `We're sorry, but we couldn't process your order due to availability issues.\n\nYour payment of €${session.amount_total / 100} has been refunded and should appear in your account within 5-10 business days.\n\nOrder ID: ${order.id}\nRefund ID: ${refund.id}\n\nIf you have any questions, please contact our support team.`,
                };

                await sgMail.send(refundMsg);
                console.log("📧 Refund notification sent");
              } else {
                console.log(`⚠️ Unexpected payment status: ${paymentIntent.status}`);
                
                await prisma.order.update({
                  where: { id: order.id },
                  data: { 
                    paymentStatus: `failed_${paymentIntent.status}`,
                    dropshipperStatus: "failed"
                  },
                });
              }
            }
          } catch (handleErr) {
            console.error("❌ Error handling payment after BigBuy failure:", handleErr.message);

            try {
              posthog.capture({
                distinctId: session.id,
                event: "stripe_payment_handling_failed",
                properties: {
                  order_id: order.id,
                  stripe_session_id: session.id,
                  error: String(handleErr?.message || handleErr),
                },
              });
            } catch {}
          }

          // Return early - don't send success email or try to capture payment
          return res.status(200).json({ received: true });
        }

        // 🔥 STEP 3: BigBuy succeeded, ensure payment is captured
        try {
          if (paymentIntentId && paymentIntent) {
            if (paymentIntent.status === "requires_capture") {
              console.log("💰 Capturing Stripe payment...");
              
              await stripe.paymentIntents.capture(paymentIntentId);

              await prisma.order.update({
                where: { id: order.id },
                data: { paymentStatus: "paid" },
              });

              console.log("✅ Stripe payment captured successfully");

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
            } else if (paymentIntent.status === "succeeded") {
              console.log("✅ Payment already captured automatically");
              
              await prisma.order.update({
                where: { id: order.id },
                data: { paymentStatus: "paid" },
              });

              try {
                posthog.capture({
                  distinctId: session.id,
                  event: "stripe_payment_already_captured",
                  properties: {
                    order_id: order.id,
                    stripe_session_id: session.id,
                    amount: session.amount_total,
                  },
                });
              } catch {}
            } else {
              console.warn(`⚠️ Unexpected payment status after BigBuy success: ${paymentIntent.status}`);
              
              await prisma.order.update({
                where: { id: order.id },
                data: { paymentStatus: `uncertain_${paymentIntent.status}` },
              });
            }
          }
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
        }

        // 📧 Send confirmation email using SendGrid
        const sgMail = require("@sendgrid/mail");
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        const emailItems = items
          .map((i) => `• ${i.name} x${i.quantity} (€${i.price})`)
          .join("\n");

        const msg = {
          to: customerDetails.email,
          from: process.env.SENDGRID_FROM_EMAIL,
          subject: "Order Confirmation",
          text: `Thanks for your order!\n\nItems:\n${emailItems}\n\nTotal: €${
            session.amount_total / 100
          }\n\nWe will notify you when it ships.`,
        };

        try {
          await sgMail.send(msg);
          console.log("📧 Confirmation email sent to:", customerDetails.email);

          try {
            posthog.capture({
              distinctId: session.id,
              event: "order_email_sent",
              properties: { stripe_session_id: session.id, to: customerDetails.email },
            });
          } catch {}
        } catch (err) {
          console.error("❌ Error sending email:", err.message);

          try {
            posthog.capture({
              distinctId: session.id,
              event: "order_email_failed",
              properties: {
                stripe_session_id: session.id,
                error: String(err?.message || err),
              },
            });
          } catch {}
        }
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