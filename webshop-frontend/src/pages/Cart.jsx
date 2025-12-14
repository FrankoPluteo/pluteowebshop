import { useEffect } from "react";
import { useCart } from "../context/CartContext";
import { Link } from "react-router-dom";
import "../styles/Cart.css";
import posthog from "posthog-js";

export default function Cart() {
  const context = useCart();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!context) {
    return <p>Cart context is not available.</p>;
  }

  const { cart, increaseQuantity, decreaseQuantity, removeFromCart } = context;

  if (!cart || cart.length === 0) {
    return (
      <div className="cart-container">
        <h1 className="cart-title">Your Cart</h1>
        <p className="empty-cart-message">Your cart is empty.</p>
        <Link to="/products" className="continue-shopping-link">
          Continue Shopping
        </Link>
      </div>
    );
  }

  const total = cart
    .reduce(
      (acc, item) =>
        acc + parseFloat(item.finalPrice ?? item.price) * item.quantity,
      0
    )
    .toFixed(2);

  const handleCheckout = async () => {
    // ✅ PostHog: checkout started
    try {
      posthog.capture("checkout_started", {
        items_count: cart.reduce((a, i) => a + (i.quantity || 0), 0),
        cart_value: Number(total),
      });
    } catch {}

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/stripe/create-checkout-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cartItems: cart.map((item) => ({
              productId: item.id,
              quantity: item.quantity,
            })),
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();

        // ✅ PostHog: checkout failed (server returned error)
        try {
          posthog.capture("checkout_failed", {
            status: res.status,
            message: errorText?.slice?.(0, 500) || String(errorText),
          });
        } catch {}

        throw new Error(
          `HTTP error! status: ${res.status}, message: ${errorText}`
        );
      }

      const data = await res.json();
      if (data && data.url) {
        window.location.href = data.url;
      } else {
        console.error("No checkout URL received from the backend:", data);

        // ✅ PostHog: checkout failed (no url)
        try {
          posthog.capture("checkout_failed", {
            status: 200,
            message: "No checkout URL returned",
          });
        } catch {}

        alert("Failed to start checkout. Please try again.");
      }
    } catch (error) {
      console.error("Error during checkout process:", error);

      // ✅ PostHog: checkout failed (exception)
      try {
        posthog.capture("checkout_failed", {
          error: String(error?.message || error),
        });
      } catch {}

      alert("Checkout failed. Please try again or contact support.");
    }
  };

  return (
    <div className="cart-container">
      <h1 className="cart-title">Your Cart</h1>
      <Link to="/products" className="continue-shopping-link">
        Continue Shopping
      </Link>
      <div className="cart-item-list">
        {cart.map((item) => (
          <div key={item.id} className="cart-item">
            <img
              src={
                item.image?.startsWith("http")
                  ? item.image // ✅ already a Cloudinary or external URL
                  : `${API_BASE_URL}${item.image}` // fallback for local/dev images
              }
              alt={item.name}
              className="cart-item-image"
            />
            <div className="cart-item-details">
              <h3 className="cart-item-name">{item.name}</h3>
              <p className="cart-item-brand">{item.brand}</p>
              <p className="cart-item-price">
                €{((item.finalPrice ?? item.price) * item.quantity).toFixed(2)}
              </p>
            </div>

            <div className="quantity-controls">
              <button
                onClick={() => {
                  decreaseQuantity(item.id);
                  try {
                    posthog.capture("cart_quantity_decreased", {
                      product_id: item.id,
                      product_name: item.name,
                      brand: item.brand,
                      quantity: item.quantity,
                      source: "cart",
                    });
                  } catch {}
                }}
                className="quantity-btn"
                disabled={item.quantity <= 1}
              >
                -
              </button>

              <span className="item-quantity">{item.quantity}</span>

              <button
                onClick={() => {
                  increaseQuantity(item.id);
                  try {
                    posthog.capture("cart_quantity_increased", {
                      product_id: item.id,
                      product_name: item.name,
                      brand: item.brand,
                      quantity: item.quantity,
                      source: "cart",
                    });
                  } catch {}
                }}
                className="quantity-btn"
              >
                +
              </button>
            </div>

            <button
              onClick={() => {
                removeFromCart(item.id);
                try {
                  posthog.capture("remove_from_cart", {
                    product_id: item.id,
                    product_name: item.name,
                    brand: item.brand,
                    quantity: item.quantity,
                    source: "cart",
                  });
                } catch {}
              }}
              className="remove-item-btn"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="cart-summary">
        <div className="cart-total">
          <div>Total:</div>&nbsp;{total}€
        </div>
        <button onClick={handleCheckout} className="checkout-btn">
          Checkout with Stripe
        </button>
      </div>
    </div>
  );
}
