const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// POST /api/stripe/create-checkout-session
router.post("/create-checkout-session", async (req, res) => {
  const { cartItems } = req.body;

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: "Cart items are required." });
  }

  let line_items = [];
  try {
    for (const item of cartItems) {
      if (
        typeof item.productId !== 'number' ||
        item.productId <= 0 ||
        typeof item.quantity !== 'number' ||
        item.quantity <= 0
      ) {
        return res.status(400).json({ error: "Invalid product ID or quantity in cart." });
      }

      const dbProduct = await prisma.products.findUnique({
        where: { id: item.productId }
      });

      if (!dbProduct) {
        return res.status(404).json({ error: `Product with ID ${item.productId} not found.` });
      }

      const salePercentage = dbProduct.salepercentage || 0;
      const discountedPrice =
        salePercentage > 0
          ? dbProduct.price * (1 - salePercentage / 100)
          : dbProduct.price;

      line_items.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: dbProduct.name,
          },
          unit_amount: Math.round(discountedPrice * 100), // ✅ discounted amount in cents
        },
        quantity: item.quantity,
      });

    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: 'payment',
      line_items,
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,

      shipping_address_collection: {
        allowed_countries: [
          "AC","AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AT","AU","AW","AX","AZ",
          "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
          "CA","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CV","CW","CY","CZ",
          "DE","DJ","DK","DM","DO","DZ",
          "EC","EE","EG","EH","ER","ES","ET",
          "FI","FJ","FK","FO","FR",
          "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
          "HK","HN","HR","HT","HU",
          "ID","IE","IL","IM","IN","IO","IQ","IS","IT",
          "JE","JM","JO","JP",
          "KE","KG","KH","KI","KM","KN","KR","KW","KY","KZ",
          "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
          "MA","MC","MD","ME","MF","MG","MK","ML","MM","MN","MO","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
          "NA","NC","NE","NG","NI","NL","NO","NP","NR","NU","NZ",
          "OM",
          "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PY",
          "QA",
          "RE","RO","RS","RU","RW",
          "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SZ",
          "TA","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
          "UA","UG","US","UY","UZ",
          "VA","VC","VE","VG","VN","VU",
          "WF","WS",
          "XK",
          "YE","YT",
          "ZA","ZM","ZW",
          "ZZ"
        ]
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error && (error.stack || error.message || error));
    res.status(500).json({ error: "Failed to create checkout session. Please try again." });
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
});

module.exports = router;
