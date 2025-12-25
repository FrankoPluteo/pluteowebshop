// webshop-frontend/src/pages/Success.js
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import pluteologosuccess from "../../public/pluteoshort.svg";
import posthog from "posthog-js";

export default function SuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  
  const [orderStatus, setOrderStatus] = useState("processing"); // processing, success, failed
  const [orderDetails, setOrderDetails] = useState(null);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const MAX_POLLING_ATTEMPTS = 30; // 30 attempts * 2 seconds = 60 seconds max wait

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get("session_id");
    
    if (!sessionId) {
      navigate("/failed");
      return;
    }

    let pollInterval;
    let attempts = 0;

    const checkOrderStatus = async () => {
      try {
        attempts++;
        setPollingAttempts(attempts);

        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        const res = await fetch(`${API_BASE_URL}/api/orders/${sessionId}`);
        
        if (!res.ok) {
          if (attempts >= MAX_POLLING_ATTEMPTS) {
            throw new Error("Order verification timeout");
          }
          return; // Continue polling
        }
        
        const order = await res.json();
        setOrderDetails(order);

        // Check order status
        const paymentOk = order.paymentStatus === "paid";
        const dropshipperOk = ["sent", "sent_simulated"].includes(order.dropshipperStatus);
        
        if (paymentOk && dropshipperOk) {
          // ✅ SUCCESS: Both payment captured AND order sent to BigBuy
          setOrderStatus("success");
          clearCart();
          clearInterval(pollInterval);

          posthog.capture("purchase_completed", {
            stripe_session_id: sessionId,
            order_id: order.id,
            revenue_cents: order.totalAmount,
            currency: (order.currency || "eur").toUpperCase(),
            items_count: Array.isArray(order.items) 
              ? order.items.reduce((a, i) => a + (i.quantity || 0), 0) 
              : null,
            dropshipper_status: order.dropshipperStatus,
          });
        } else if (
          order.paymentStatus === "canceled" ||
          order.paymentStatus === "capture_failed" ||
          order.dropshipperStatus === "failed" ||
          order.dropshipperStatus === "error" ||
          order.dropshipperStatus === "check_failed" ||
          order.dropshipperStatus === "payment_error"
        ) {
          // ❌ FAILED: Payment canceled or BigBuy failed
          setOrderStatus("failed");
          clearInterval(pollInterval);

          posthog.capture("purchase_failed", {
            stripe_session_id: sessionId,
            order_id: order.id,
            payment_status: order.paymentStatus,
            dropshipper_status: order.dropshipperStatus,
          });

          // Redirect to failed page after 2 seconds
          setTimeout(() => navigate("/failed"), 2000);
        } else if (attempts >= MAX_POLLING_ATTEMPTS) {
          // ⏱️ TIMEOUT: Taking too long
          setOrderStatus("failed");
          clearInterval(pollInterval);

          posthog.capture("purchase_timeout", {
            stripe_session_id: sessionId,
            payment_status: order.paymentStatus,
            dropshipper_status: order.dropshipperStatus,
          });

          setTimeout(() => navigate("/failed"), 2000);
        }
        // Otherwise keep polling (status is still "processing")
        
      } catch (e) {
        console.error("Error checking order status:", e);
        
        if (attempts >= MAX_POLLING_ATTEMPTS) {
          setOrderStatus("failed");
          clearInterval(pollInterval);

          posthog.capture("purchase_verification_failed", {
            stripe_session_id: sessionId,
            message: String(e?.message || e),
          });

          setTimeout(() => navigate("/failed"), 2000);
        }
      }
    };

    // Start polling immediately
    checkOrderStatus();
    
    // Then poll every 2 seconds
    pollInterval = setInterval(checkOrderStatus, 2000);

    // Cleanup
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading state
  if (orderStatus === "processing") {
    return (
      <div style={styles.container}>
        <div style={styles.iconWrapper}>
          <i className="fas fa-spinner fa-spin" style={styles.spinnerIcon}></i>
        </div>
        <h1 style={styles.title}>Processing Your Order...</h1>
        <p style={styles.message}>
          Please wait while we confirm your payment and prepare your order for shipment.
        </p>
        <p style={styles.subMessage}>
          This usually takes just a few seconds...
        </p>
        {pollingAttempts > 10 && (
          <p style={styles.warningMessage}>
            Still processing... This is taking longer than usual but don't worry, we're on it!
          </p>
        )}
      </div>
    );
  }

  // Failed state
  if (orderStatus === "failed") {
    return (
      <div style={styles.container}>
        <div style={styles.iconWrapper}>
          <i className="fas fa-times-circle" style={styles.errorIcon}></i>
        </div>
        <h1 style={styles.title}>Order Processing Failed</h1>
        <p style={styles.message}>
          We encountered an issue processing your order. 
          {orderDetails?.paymentStatus === "canceled" && " Your payment has been canceled and you have not been charged."}
        </p>
        <p style={styles.subMessage}>Redirecting you back...</p>
      </div>
    );
  }

  // Success state
  return (
    <div style={styles.container}>
      <div style={styles.iconWrapper}>
        <i className="fas fa-check-circle" style={styles.checkIcon}></i>
      </div>
      <h1 style={styles.title}>Thank You!</h1>
      <p style={styles.message}>
        Your payment was successful and your order has been sent for fulfillment. 
        A confirmation email with all your order details has been sent to you.
      </p>
      {orderDetails && (
        <div style={styles.orderInfo}>
          <p><strong>Order ID:</strong> {orderDetails.id}</p>
          <p><strong>Total:</strong> €{(orderDetails.totalAmount / 100).toFixed(2)}</p>
        </div>
      )}
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
    alignItems: "center",
    gap: "20px"
  },
  iconWrapper: {},
  checkIcon: {
    fontSize: "80px",
    color: "#28a745",
  },
  errorIcon: {
    fontSize: "80px",
    color: "#dc3545",
  },
  spinnerIcon: {
    fontSize: "80px",
    color: "#007bff",
  },
  title: {
    fontSize: "2rem",
    color: "#333",
  },
  message: {
    fontSize: "1rem",
    color: "#555",
  },
  subMessage: {
    fontSize: "0.9rem",
    color: "#777",
    fontStyle: "italic",
  },
  warningMessage: {
    fontSize: "0.9rem",
    color: "#ff9800",
    fontStyle: "italic",
    marginTop: "10px",
  },
  orderInfo: {
    backgroundColor: "#f8f9fa",
    padding: "15px",
    borderRadius: "8px",
    fontSize: "0.95rem",
    color: "#333",
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