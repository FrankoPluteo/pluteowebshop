import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import '../styles/ProductDetail.css';

import posthog from "posthog-js";


export default function ProductDetail() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { cart, addToCart } = useCart();
  const [cartAnimating, setCartAnimating] = useState(false);
  const [added, setAdded] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/products/${productId}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Product not found.");
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        setProduct({ 
          ...data, 
          price: parseFloat(data.price) || 0,
          salepercentage: data.salepercentage ? parseInt(data.salepercentage) : null
        });

        posthog.capture("product_viewed", {
          product_id: data.id,
          product_name: data.name,
          brand: data.brand,
          price: parseFloat(data.price) || 0,
          salepercentage: data.salepercentage ? parseInt(data.salepercentage) : null,
        });

      } catch (err) {
        console.error("Error fetching product details:", err);
        setError(err.message || "Failed to load product details.");
      } finally {
        setLoading(false);
      }
    };

    if (productId) fetchProduct();
    else {
      setError("No product ID provided.");
      setLoading(false);
    }
  }, [productId, API_BASE_URL]);

  const handleAddToCart = () => {
    if (!product || !product.id) return;
    addToCart(product);

    posthog.capture("add_to_cart", {
      product_id: product.id,
      product_name: product.name,
      brand: product.brand,
      price: product.price,
      salepercentage: product.salepercentage ?? null,
      source: "product_detail",
    });

    setAdded(true);
    setCartAnimating(true);
    setTimeout(() => { setAdded(false); setCartAnimating(false); }, 600);
  };

  const handleBackToProducts = () => {
    // Navigate to products without any state - this will trigger restoration from sessionStorage
    navigate('/products');
  };

  const calculateSalePrice = (price, salePercentage) => {
    return price * (1 - salePercentage / 100);
  };

  if (loading) return <div className="product-detail-container"><p>Loading product details...</p></div>;
  if (error) return <div className="product-detail-container"><p className="error-message">{error}</p><button onClick={handleBackToProducts} className="back-to-products-btn">Back to Products</button></div>;
  if (!product) return <div className="product-detail-container"><p>Product not found.</p><button onClick={handleBackToProducts} className="back-to-products-btn">Back to Products</button></div>;

  return (
    <div className="product-detail-container">
      <div className={`fixed-cart-container ${cartAnimating ? 'shake' : ''}`}>
        <Link className="see-cart-link" to="/cart">
          <svg className="cart-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          <span className="cart-item-count">{cart.length}</span>
        </Link>
      </div>

      <button onClick={handleBackToProducts} className="back-to-products-btn">Back to Products</button>

      <div className="product-detail-card">
        <div className="product-detail-image-wrapper">
          {product.salepercentage && (
            <span className="sale-badge-detail">-{product.salepercentage}%</span>
          )}
          <img
            className="product-detail-image"
            src={product.image || '/placeholder.png'}
            alt={product.name}
          />
        </div>

        <div className="product-detail-info">
          <h2 className="product-detail-name">{product.name}</h2>
          <p className="product-detail-brand">{product.brand}</p>
          <p className='product-detail-brand'>{product.size} ml</p>
          
          {product.salepercentage ? (
            <div className="price-detail-container">
              <p className="product-detail-price-original">{product.price.toFixed(2)}€</p>
              <p className="product-detail-price-sale">{calculateSalePrice(product.price, product.salepercentage).toFixed(2)}€</p>
            </div>
          ) : (
            <p className="product-detail-price">{product.price.toFixed(2)}€</p>
          )}
          
          <p className="product-detail-description">{product.description || "No description available."}</p>
          <p className="product-detail-gender">Gender: {product.gender || "Unspecified"}</p>

          <button
            className={`add-to-cart-detail-btn ${added ? 'added' : ''}`}
            onClick={handleAddToCart}
          >
            {added ? 'Added!' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
}