import { useEffect, useState, useCallback, useRef } from "react";
import '../styles/Products.css';
import { useCart } from "../context/CartContext";
import { Link, useLocation } from "react-router-dom";
import pluteologo from "../../public/pluteoshort_dark.svg"
import Navbar from "../components/Navbar";

import posthog from "posthog-js";

export default function Products() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { cart, addToCart } = useCart();
  const [cartAnimating, setCartAnimating] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [productsPerPage] = useState(20);
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");

  const [tempSelectedBrands, setTempSelectedBrands] = useState([]);
  const [tempMaxPrice, setTempMaxPrice] = useState(0);
  const [tempGender, setTempGender] = useState("");

  const [selectedBrands, setSelectedBrands] = useState([]);
  const [maxPrice, setMaxPrice] = useState(0);
  const [gender, setGender] = useState("");

  const [showFilters, setShowFilters] = useState(false);
  const [animatingProduct, setAnimatingProduct] = useState(null);

  const [allAvailableBrands, setAllAvailableBrands] = useState([]);
  const [allAvailableGenders, setAllAvailableGenders] = useState([]);
  const [overallMaxProductPrice, setOverallMaxProductPrice] = useState(0);

  const scrollPositionRef = useRef(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  // ✅ Check for fromHome FIRST, before restoring from sessionStorage
  useEffect(() => {
    if (location.state?.fromHome) {
      sessionStorage.clear();
      window.scrollTo(0, 0);
    }
    
    // Handle filter application from Home buttons (Shop Niche/Designer)
    if (location.state?.applyFilters) {
      window.scrollTo(0, 0);
    }
  }, [location.state]);

  // ✅ Reset to first page whenever search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // ✅ Fetch filter metadata
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/products/metadata`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();

        const fetchedMaxPrice = parseFloat(data.maxPrice);
        const safeOverallMaxPrice = isNaN(fetchedMaxPrice) ? 0 : fetchedMaxPrice;

        setAllAvailableBrands(data.brands || []);
        setAllAvailableGenders(data.genders || []);
        setOverallMaxProductPrice(safeOverallMaxPrice);

        setTempMaxPrice(safeOverallMaxPrice);
        setMaxPrice(safeOverallMaxPrice);
      } catch (err) {
        console.error("Error fetching filter metadata:", err);
        setOverallMaxProductPrice(1000);
        setTempMaxPrice(1000);
        setMaxPrice(1000);
      }
    };
    fetchMetadata();
  }, [API_BASE_URL]);

  // ✅ Restore filters, page, and scroll position from sessionStorage (only if NOT fromHome)
  useEffect(() => {
    // Skip restoration if coming from home (but not from filter buttons)
    if (location.state?.fromHome) return;

    const savedPage = sessionStorage.getItem('currentPage');
    const savedScrollY = sessionStorage.getItem('scrollY');
    const savedSearch = sessionStorage.getItem('search');
    const savedBrands = sessionStorage.getItem('selectedBrands');
    const savedMaxPrice = sessionStorage.getItem('maxPrice');
    const savedGender = sessionStorage.getItem('gender');

    if (savedPage) setCurrentPage(Number(savedPage));
    if (savedSearch) setSearch(savedSearch);
    if (savedBrands) {
      const parsedBrands = JSON.parse(savedBrands);
      setSelectedBrands(parsedBrands);
      setTempSelectedBrands(parsedBrands);
    }
    if (savedMaxPrice) {
      setMaxPrice(Number(savedMaxPrice));
      setTempMaxPrice(Number(savedMaxPrice));
    }
    if (savedGender) {
      setGender(savedGender);
      setTempGender(savedGender);
    }

    // Only restore scroll if NOT applying filters from home buttons
    if (!location.state?.applyFilters) {
      setTimeout(() => {
        if (savedScrollY) window.scrollTo(0, Number(savedScrollY));
      }, 100);
    }
  }, [location.state]);

  const fetchPaginatedProducts = useCallback(async () => {
    setLoading(true);
    let url = `${API_BASE_URL}/products?page=${currentPage}&limit=${productsPerPage}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (selectedBrands.length > 0) url += `&brands=${encodeURIComponent(selectedBrands.join(','))}`;
    if (maxPrice > 0 && maxPrice < overallMaxProductPrice) url += `&maxPrice=${maxPrice}`;
    if (gender) url += `&gender=${encodeURIComponent(gender)}`;

    console.log('Fetching URL:', url);
    console.log('Selected Brands:', selectedBrands);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      console.log('Total products returned:', data.totalProducts);
      const cleanedProducts = data.products
        .map(p => ({ 
          ...p, 
          price: parseFloat(p.price) || 0,
          salepercentage: p.salepercentage ? parseInt(p.salepercentage) : null,
          stockQuantity: p.stockQuantity || 0
        }))
        .filter(p => p.price >= 0);

      setProducts(cleanedProducts);
      setTotalProductsCount(data.totalProducts);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error("Error fetching products:", err);
      setProducts([]);
      setTotalProductsCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [currentPage, productsPerPage, search, selectedBrands, maxPrice, gender, API_BASE_URL, overallMaxProductPrice]);

  useEffect(() => {
    fetchPaginatedProducts();
  }, [fetchPaginatedProducts]);

  // ✅ Save state before navigating to product detail
  const saveStateBeforeNavigate = () => {
    sessionStorage.setItem('currentPage', currentPage);
    sessionStorage.setItem('scrollY', window.scrollY);
    sessionStorage.setItem('search', search);
    sessionStorage.setItem('selectedBrands', JSON.stringify(selectedBrands));
    sessionStorage.setItem('maxPrice', maxPrice);
    sessionStorage.setItem('gender', gender);
  };

  const handleAddToCart = (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if product is in stock
    if (!product.stockQuantity || product.stockQuantity <= 0) {
      return; // Don't add to cart if out of stock
    }
    
    addToCart(product);
    setAnimatingProduct(product.id);
    setCartAnimating(true);
    setTimeout(() => {
      setAnimatingProduct(null);
      setCartAnimating(false);
    }, 600);

    posthog.capture("add_to_cart", {
      product_id: product.id,
      product_name: product.name,
      brand: product.brand,
      price: product.price,
      salepercentage: product.salepercentage ?? null,
      source: "products_grid",
      stock_quantity: product.stockQuantity,
    });
  };

  const handleTempBrandChange = (e) => {
    const value = e.target.value;
    setTempSelectedBrands(prev =>
      prev.includes(value) ? prev.filter(b => b !== value) : [...prev, value]
    );
  };

  const applyFilters = () => {
    setSelectedBrands(tempSelectedBrands);
    setMaxPrice(tempMaxPrice);
    setGender(tempGender);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setTempSelectedBrands([]);
    setTempMaxPrice(overallMaxProductPrice);
    setTempGender("");
    setSelectedBrands([]);
    setMaxPrice(overallMaxProductPrice);
    setGender("");
    setCurrentPage(1);
  };

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
    window.scrollTo(0, 0);
  };
  const goToPrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
    window.scrollTo(0, 0);
  };
  const goToPage = (pageNumber) => {
    setCurrentPage(Math.max(1, Math.min(pageNumber, totalPages)));
    window.scrollTo(0, 0);
  };

  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxPageButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

    if (endPage - startPage + 1 < maxPageButtons) startPage = Math.max(1, endPage - maxPageButtons + 1);
    if (startPage > endPage) startPage = endPage;

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <button key={i} onClick={() => goToPage(i)} className={`pagination-btn ${currentPage === i ? 'active' : ''}`}>
          {i}
        </button>
      );
    }
    return pageNumbers;
  };

  const calculateSalePrice = (price, salePercentage) => {
    return price * (1 - salePercentage / 100);
  };

  return (
    <div style={{ padding: '20px', paddingTop: "100px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", minHeight: "100vh", margin: 0, overflowX: "hidden", fontFamily: "Montserrat, sans-serif", color: "#333" }}>
      <Navbar />
      <Link className="pluteologo" to="/"><img className="pluteologo" src={pluteologo} alt="Pluteo Logo" /></Link>

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

      <div className="all-products">
        {selectedBrands.length > 0 ? `${selectedBrands.length > 5 ? 'Filtered' : selectedBrands.join(', ')} Parfumes` : 'All Parfumes'}
      </div>

      <div className="fixed-search-bar">
        <input type="text" placeholder="Search by name or brand..." value={search} onChange={e => setSearch(e.target.value)} className="filter-search" />
      </div>

      {/* Filters */}
      <div className="filters-wrapper">
        <button className="filters-toggle" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>

        <div className={`filters ${showFilters ? "show" : "hide"}`}>
          <div className="brand-checkboxes">
            {allAvailableBrands.length > 0 ? allAvailableBrands.map((b, idx) => (
              <label key={idx} className="brand-label">
                <input type="checkbox" value={b} checked={tempSelectedBrands.includes(b)} onChange={handleTempBrandChange} />
                {b}
              </label>
            )) : <p>No brands available.</p>}
          </div>

          <div className="price-filter">
            <label>Max Price: ${(typeof tempMaxPrice === 'number' && !isNaN(tempMaxPrice) ? tempMaxPrice : 0).toFixed(2)}</label>
            <input type="range" min="0" max={overallMaxProductPrice} value={tempMaxPrice} onChange={e => setTempMaxPrice(Number(e.target.value))} />
          </div>

          <select
            value={tempGender}
            onChange={e => setTempGender(e.target.value)}
            className="gender-select"
          >
            <option value="">All Genders</option>
            {allAvailableGenders
              .filter(g => g.toLowerCase() !== 'unisex')
              .map((g, idx) => (
                <option key={idx} value={g.toLowerCase()}>
                  {g}
                </option>
              ))}
          </select>

          <div className="filter-buttons">
            <button className="apply-btn" onClick={applyFilters}>Apply Filters</button>
            <button className="reset-btn" onClick={resetFilters}>Reset Filters</button>
          </div>
        </div>
      </div>

      {/* Products */}
      {loading ? <p>Loading products...</p> : (
        <>
          <div className="product-grid">
            {products.length > 0 ? products.map(product => {
              const isInStock = product.stockQuantity && product.stockQuantity > 0;
              
              return (
              <Link 
                to={`/product/${product.id}`} 
                className="product-card-link" 
                key={product.id} 
                onClick={() => {
                  saveStateBeforeNavigate();
                  posthog.capture("product_clicked", {
                    product_id: product.id,
                    product_name: product.name,
                    brand: product.brand,
                    price: product.price,
                    salepercentage: product.salepercentage ?? null,
                    source: "products_grid",
                    in_stock: isInStock,
                  });
                }}
              >
                <div className={`product-card ${!isInStock ? 'out-of-stock' : ''}`}>
                  <div className="product-top">
                    {product.salepercentage && (
                      <span className="sale-badge">-{product.salepercentage}%</span>
                    )}
                    {!isInStock && (
                      <span className="stock-badge out">Out of Stock</span>
                    )}
                    <img
                      className="productImage"
                      src={product.image || '/placeholder.png'}
                      alt={product.name}
                    />
                  </div>
                  <div className="product-bottom">
                    <div className="product-info">
                      <div className="product-name">{product.name}</div>
                      <div className="product-size">{product.size} ml</div>
                      <div className="product-brand">{product.brand}</div>
                    </div>
                    <div className="price-add-to-cart">
                      {product.salepercentage ? (
                        <div className="price-container">
                          <p className="product-price-original">{product.price.toFixed(2)}€</p>
                          <p className="product-price-sale">{calculateSalePrice(product.price, product.salepercentage).toFixed(2)}€</p>
                        </div>
                      ) : (
                        <p className="product-price">{product.price.toFixed(2)}€</p>
                      )}
                      <button
                        className={`add-to-cart-btn ${animatingProduct === product.id ? 'added' : ''} ${!isInStock ? 'disabled' : ''}`}
                        onClick={(e) => handleAddToCart(e, product)}
                        disabled={!isInStock}
                      >
                        {!isInStock ? 'Out of Stock' : 'Add to Cart'}
                      </button>
                    </div>
                  </div>
                </div>
              </Link>
            )}) : <p>No products match your current filters or are available.</p>}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={goToPrevPage} disabled={currentPage === 1}>Previous</button>
              {renderPageNumbers()}
              <button onClick={goToNextPage} disabled={currentPage === totalPages}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}