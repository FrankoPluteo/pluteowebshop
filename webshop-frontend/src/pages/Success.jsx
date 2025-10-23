// webshop-frontend/src/pages/Success.js
import React, { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import pluteologosuccess from "../../public/pluteoshort_dark.svg"

export default function SuccessPage() {
  const location = useLocation();
  const { clearCart } = useCart();

  useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("session_id")) {
    clearCart(); // clear only once
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // <-- empty dependency array


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
