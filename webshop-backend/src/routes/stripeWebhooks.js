// webshop-backend/src/routes/stripeWebhooks.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const getRawBody = require("raw-body");
const nodemailer = require("nodemailer");
const Order = require("../models/Order");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false, // TLS is false for 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false, // fixes self-signed certificate issue
    },
});

router.post("/", async (req, res) => {
    let event;
    let rawBody;

    try {
        rawBody = await getRawBody(req);
    } catch (err) {
        console.error(`Error getting raw body: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const signature = req.headers["stripe-signature"];
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: Invalid signature.`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('🎉 checkout.session.completed received for session:', session.id);

        try {
            // Get line items
            const lineItemsResponse = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
            const itemsToSave = (lineItemsResponse.data || []).map(item => ({
                description: item.description,
                quantity: item.quantity,
                unit_amount: item.price?.unit_amount ?? item.amount_subtotal ?? null,
                currency: item.price?.currency ?? item.currency ?? null,
            }));

            // Extract shipping info (basic attempt)
            let shippingAddress =
    session.shipping_details ||
    session.shipping ||
    (session.customer_details && session.customer_details.address) ||
    (session.metadata && session.metadata.shippingAddress) ||
    {};

// Extract email & name
let email =
    session.customer_details?.email ||
    session.customer_email ||
    (session.metadata && session.metadata.customerEmail) ||
    null;

let name =
    session.customer_details?.name ||
    (session.metadata && session.metadata.customerName) ||
    null;

// If session was via Payment Link / Link (fast checkout) and shipping is missing, fetch from customer
if ((!shippingAddress.line1 || !shippingAddress.city) && session.customer) {
    try {
        const customer = await stripe.customers.retrieve(session.customer, {
            expand: ['shipping'],
        });

        // Prefer customer.shipping if available
        if (customer.shipping?.address) {
            shippingAddress = {
                ...shippingAddress,
                line1: customer.shipping.address.line1 || shippingAddress.line1,
                line2: customer.shipping.address.line2 || shippingAddress.line2,
                city: customer.shipping.address.city || shippingAddress.city,
                state: customer.shipping.address.state || shippingAddress.state,
                postal_code: customer.shipping.address.postal_code || shippingAddress.postal_code,
                country: customer.shipping.address.country || shippingAddress.country,
            };

            if (!name && customer.shipping.name) {
                name = customer.shipping.name;
            }
        } else if (customer.address) {
            // fallback to customer.address
            shippingAddress = {
                ...shippingAddress,
                line1: customer.address.line1 || shippingAddress.line1,
                line2: customer.address.line2 || shippingAddress.line2,
                city: customer.address.city || shippingAddress.city,
                state: customer.address.state || shippingAddress.state,
                postal_code: customer.address.postal_code || shippingAddress.postal_code,
                country: customer.address.country || shippingAddress.country,
            };
        }

        if (!email && customer.email) {
            email = customer.email;
        }
        if (!name && customer.name) {
            name = customer.name;
        }
    } catch (err) {
        console.error("Error fetching customer info from Stripe:", err);
    }
}

            // total & currency
            const totalAmount = session.amount_total ?? session.total_amount ?? null;
            const currency = session.currency ?? null;

            // Save to Mongo
            const newOrder = new Order({
                stripeSessionId: session.id,
                customerEmail: email,
                customerName: name,
                shippingAddress: shippingAddress || {},
                totalAmount: totalAmount,
                currency: currency,
                items: itemsToSave,
                paymentStatus: 'paid',
                dropshipperStatus: 'not_sent',
            });

            await newOrder.save();
            console.log(`✅ Order saved (id=${newOrder._id}) for session ${session.id}`);

            // Send confirmation email
            if (email) {
                try {
                    const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: email,
                        subject: "Your Order Confirmation",
                        html: `
                            <h2>Thank you for your order, ${name || ""}!</h2>
                            <p>Your payment of ${(totalAmount/100).toFixed(2)} ${currency?.toUpperCase()} was successful.</p>
                            <h3>Order Details:</h3>
                            <h3>Order ID: <strong>${newOrder._id}</strong></h3>
                            <ul>
                                ${itemsToSave.map(i => `<li>${i.description} x ${i.quantity} (${(i.unit_amount/100).toFixed(2)} ${i.currency.toUpperCase()} each)</li>`).join("")}
                            </ul>
                            <h4>Shipping Address:</h4>
                            <p>
                                ${shippingAddress.line1 || ""} ${shippingAddress.line2 || ""}<br>
                                ${shippingAddress.city || ""} ${shippingAddress.state || ""} ${shippingAddress.postal_code || ""}<br>
                                ${shippingAddress.country || ""}
                            </p>
                        `
                    };
                    await transporter.sendMail(mailOptions);
                    console.log(`✅ Confirmation email sent to ${email}`);
                } catch (err) {
                    console.error("❌ Failed to send confirmation email:", err);
                }
            }

        } catch (error) {
            console.error("❌ Error processing checkout.session.completed:", error && (error.stack || error.message || error));
        }

    } else {
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).send();
});

module.exports = router;
