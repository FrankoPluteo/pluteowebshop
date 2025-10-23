import { createContext, useState, useContext, useEffect } from "react";

// Create a Context for the cart
const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    try {
      const storedCart = localStorage.getItem("cart");
      return storedCart ? JSON.parse(storedCart) : [];
    } catch (error) {
      console.error("Failed to parse cart from localStorage", error);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(cart));
    } catch (error) {
      console.error("Failed to save cart to localStorage", error);
    }
  }, [cart]);

const addToCart = (product) => {
  if (!product) {
    console.error("Cannot add to cart: product is null or undefined");
    return;
  }

  if (!product.id) {
    console.error("Cannot add to cart: product is missing id property", product);
    return;
  }

  // ✅ calculate discounted price once when adding to cart
  const salePercentage = product.salepercentage || 0;
  const finalPrice = salePercentage
    ? product.price * (1 - salePercentage / 100)
    : product.price;

  setCart((prevCart) => {
    const existingItem = prevCart.find((item) => item.id === product.id);
    if (existingItem) {
      return prevCart.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
    } else {
      return [
        ...prevCart,
        { ...product, quantity: 1, finalPrice: parseFloat(finalPrice.toFixed(2)) },
      ];
    }
  });
};


  const increaseQuantity = (productId) => {
    if (!productId) {
      console.error("Cannot increase quantity: productId is required");
      return;
    }

    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === productId ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  };

  const decreaseQuantity = (productId) => {
    if (!productId) {
      console.error("Cannot decrease quantity: productId is required");
      return;
    }

    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) => {
    if (!productId) {
      console.error("Cannot remove from cart: productId is required");
      return;
    }

    setCart((prevCart) => prevCart.filter((item) => item.id !== productId));
  };

  // ✅ New function to clear the cart completely
  const clearCart = () => {
    setCart([]);
    localStorage.removeItem("cart");
  };

  const contextValue = {
    cart,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
    clearCart,
  };

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};