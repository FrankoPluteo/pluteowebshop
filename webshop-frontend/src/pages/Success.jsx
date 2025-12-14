// webshop-frontend/src/pages/Success.js
import React, { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import pluteologosuccess from "../../public/pluteoshort.svg"

import posthog from "posthog-js";


export default function SuccessPage() {
  const location = useLocation();
  const { clearCart } = useCart();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    clearCart();

    (async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        const res = await fetch(`${API_BASE_URL}/api/orders/${sessionId}`);
        if (!res.ok) throw new Error(`Order fetch failed: ${res.status}`);
        const order = await res.json();

        posthog.capture("purchase_completed", {
          stripe_session_id: sessionId,
          order_id: order.id,
          revenue_cents: order.totalAmount,   // your DB stores Stripe amount_total (cents)
          currency: (order.currency || "eur").toUpperCase(),
          items_count: Array.isArray(order.items) ? order.items.reduce((a, i) => a + (i.quantity || 0), 0) : null,
          dropshipper_status: order.dropshipperStatus ?? null,
        });
      } catch (e) {
        posthog.capture("purchase_completed_unverified", {
          stripe_session_id: sessionId,
          message: String(e?.message || e),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  return (
    <div style={styles.container}>
      <div style={styles.iconWrapper}>
        <i className="fas fa-check-circle" style={styles.checkIcon}></i>
      </div>
      <h1 style={styles.title}>Thank You!</h1>
      <p style={styles.message}>
        Your payment was successful. A confirmation email with all your order details has been sent to you.
      </p>
      <img style={styles.img} src={pluteologosuccess} alt="Success Logo" />
      <Link to="/products" style={styles.link}>Back to shop</Link>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "Montserrat",
    maxWidth: "600px",
    margin: "100px auto",
    padding: "40px",
    borderRadius: "12px",
    backgroundColor: "#fff",
    textAlign: "center",
    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center", // makes sure all children are centered in the column
    gap: "20px" // adds spacing between each element
  },
  iconWrapper: {},
  checkIcon: {
    fontSize: "80px",
    color: "#28a745",
  },
  title: {
    fontSize: "2rem",
    color: "#333",
  },
  message: {
    fontSize: "1rem",
    color: "#555",
  },
  img: {
    width: "200px",
  },
  link: {
    marginTop: "20px",
    fontSize: "1rem",
    color: "#007bff",
    textDecoration: "none",
  },
};
