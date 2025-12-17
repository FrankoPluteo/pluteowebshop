// diagnostic-script.js
// Run this to check why payment is being auto-captured
const Stripe = require("stripe");
require("dotenv").config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function checkSessionConfig(sessionId) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    console.log("=== Session Details ===");
    console.log("Session ID:", session.id);
    console.log("Payment Status:", session.payment_status);
    console.log("Mode:", session.mode);
    
    if (session.payment_intent) {
      console.log("\n=== Payment Intent Details ===");
      console.log("Payment Intent ID:", session.payment_intent.id);
      console.log("Status:", session.payment_intent.status);
      console.log("Capture Method:", session.payment_intent.capture_method);
      console.log("Amount:", session.payment_intent.amount / 100);
      console.log("Currency:", session.payment_intent.currency);
      console.log("Metadata:", session.payment_intent.metadata);
      
      if (session.payment_intent.capture_method !== "manual") {
        console.log("\n⚠️  WARNING: Capture method is NOT set to manual!");
        console.log("This will cause immediate capture instead of authorization.");
      } else {
        console.log("\n✅ Capture method is correctly set to manual");
      }
      
      if (session.payment_intent.status === "succeeded") {
        console.log("\n⚠️  Payment has already been captured!");
      } else if (session.payment_intent.status === "requires_capture") {
        console.log("\n✅ Payment is authorized and awaiting capture");
      }
    }

    // Check if automatic tax is enabled (can cause issues)
    if (session.automatic_tax && session.automatic_tax.enabled) {
      console.log("\n⚠️  Automatic tax is enabled - this may cause issues with manual capture");
    }

  } catch (err) {
    console.error("Error checking session:", err.message);
  }
}

// Usage: node diagnostic-script.js cs_test_xxxxx
const sessionId = process.argv[2];

if (!sessionId) {
  console.log("Usage: node diagnostic-script.js <session_id>");
  console.log("Example: node diagnostic-script.js cs_live_a1HUPwwTHql22Mby8zn8a71vHW8YnxFVgefTMvOvb6bpd8a4U22cBRVnx9");
  process.exit(1);
}

checkSessionConfig(sessionId);