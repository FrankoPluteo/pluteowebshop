// webshop-frontend/src/pages/Failed.js
import React from "react";
import { Link } from "react-router-dom";

export default function Failed() {
  return (
    <div style={styles.container}>
      <div style={styles.iconWrapper}>
        <i className="fas fa-times-circle" style={styles.errorIcon}></i>
      </div>
      <h1 style={styles.title}>Payment Canceled</h1>
      <p style={styles.message}>
        Your payment was not completed. This could be because:
      </p>
      <ul style={styles.reasonList}>
        <li>You canceled the payment</li>
        <li>The payment was declined</li>
        <li>There was an issue with product availability</li>
        <li>A technical error occurred</li>
      </ul>
      <p style={styles.reassurance}>
        <strong>Don't worry</strong> - no charges have been made to your card.
      </p>
      <div style={styles.buttonGroup}>
        <Link to="/cart" style={styles.primaryButton}>
          <i className="fas fa-shopping-cart"></i> Back to Cart
        </Link>
        <Link to="/products" style={styles.secondaryButton}>
          <i className="fas fa-store"></i> Continue Shopping
        </Link>
      </div>
      <p style={styles.helpText}>
        Need help? Contact our support team at support@yourstore.com
      </p>
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
  errorIcon: {
    fontSize: "80px",
    color: "#dc3545",
  },
  title: {
    fontSize: "2rem",
    color: "#333",
    marginBottom: "10px",
  },
  message: {
    fontSize: "1rem",
    color: "#555",
    marginBottom: "10px",
  },
  reasonList: {
    textAlign: "left",
    fontSize: "0.95rem",
    color: "#666",
    lineHeight: "1.8",
    maxWidth: "400px",
  },
  reassurance: {
    fontSize: "1rem",
    color: "#28a745",
    padding: "15px",
    backgroundColor: "#d4edda",
    borderRadius: "8px",
    border: "1px solid #c3e6cb",
  },
  buttonGroup: {
    display: "flex",
    gap: "15px",
    marginTop: "10px",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  primaryButton: {
    padding: "12px 24px",
    fontSize: "1rem",
    color: "#fff",
    backgroundColor: "#007bff",
    textDecoration: "none",
    borderRadius: "8px",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    transition: "background-color 0.3s",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "12px 24px",
    fontSize: "1rem",
    color: "#007bff",
    backgroundColor: "#fff",
    textDecoration: "none",
    borderRadius: "8px",
    border: "2px solid #007bff",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.3s",
    cursor: "pointer",
  },
  helpText: {
    fontSize: "0.9rem",
    color: "#888",
    marginTop: "20px",
  },
};