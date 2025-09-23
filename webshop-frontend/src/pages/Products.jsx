import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import '../styles/Products.css';
import { useCart } from "../context/CartContext";
import { Link } from "react-router-dom";
import pluteologo from "../images/pluteologo.svg";
import Navbar from "../components/Navbar";

// This is the main component for the products page.
export default function Products() {
  // --- STATE MANAGEMENT ---
  // Product data and loading status
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { cart, addToCart } = useCart(); // Destructure 'cart' to get item count
  const [cartAnimating, setCartAnimating] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [productsPerPage] = useState(20);
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Search state (for the fixed search bar)
  const [search, setSearch] = useState("");

  // Temporary filter states (for form inputs, updated on user interaction)
  const [tempSelectedBrands, setTempSelectedBrands] = useState([]);
  const [tempMaxPrice, setTempMaxPrice] = useState(0);
  const [tempGender, setTempGender] = useState("");

  // Applied filter states (only change when 'Apply' is clicked)
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [maxPrice, setMaxPrice] = useState(0);
  const [gender, setGender] = useState("");

  // UI states
  const [showFilters, setShowFilters] = useState(false);
  const [animatingProduct, setAnimatingProduct] = useState(null);

  // Metadata states (for filter options, fetched once)
  const [allAvailableBrands, setAllAvailableBrands] = useState([]);
  const [allAvailableGenders, setAllAvailableGenders] = useState([]);
  const [overallMaxProductPrice, setOverallMaxProductPrice] = useState(0);

  // Use a ref to store the scroll position to be restored after loading
  const scrollPositionRef = useRef(null);

  // Use the environment variable for the base URL
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  // --- EFFECTS ---

  // Fetches filter metadata (brands, genders, max price) on initial component load.
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/products/metadata`);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
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

  // Handle filter data from home page navigation
  useEffect(() => {
    const filterType = sessionStorage.getItem('filterType');
    const brandsFromHome = sessionStorage.getItem('selectedBrands');

    if (filterType && brandsFromHome) {
      const brands = JSON.parse(brandsFromHome);
      
      // Apply the filter immediately
      setSelectedBrands(brands);
      setTempSelectedBrands(brands);
      
      // Reset to first page
      setCurrentPage(1);
      
      // Clean up sessionStorage to prevent reapplying on refresh
      sessionStorage.removeItem('filterType');
      sessionStorage.removeItem('selectedBrands');
    }
  }, []);

  // Fetches products based on current filters and pagination.
  const fetchPaginatedProducts = useCallback(async () => {
    setLoading(true);
    let url = `${API_BASE_URL}/products?page=${currentPage}&limit=${productsPerPage}`;

    // Append filters to the URL if they are set
    if (search) {
      url += `&search=${search}`;
    }
    if (selectedBrands.length > 0) {
      url += `&brands=${selectedBrands.join(',')}`;
    }
    // Only apply maxPrice if it's less than the overall max price
    if (maxPrice > 0 && maxPrice < overallMaxProductPrice) {
      url += `&maxPrice=${maxPrice}`;
    }
    if (gender) {
      url += `&gender=${gender}`;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();

      // Clean the data and ensure prices are numbers
      const cleanedProducts = data.products.map(p => ({
        ...p,
        price: parseFloat(p.price) || 0
      })).filter(p => p.price >= 0);

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

  // Re-fetch products whenever filters or pagination change.
  useEffect(() => {
    fetchPaginatedProducts();
  }, [fetchPaginatedProducts]);

  // This useEffect handles restoring scroll position and page number from sessionStorage
  useEffect(() => {
    const savedPage = sessionStorage.getItem('currentPage');
    const savedScrollY = sessionStorage.getItem('scrollY');
    const savedSearch = sessionStorage.getItem('search');
    const savedBrands = sessionStorage.getItem('selectedBrands');
    const savedMaxPrice = sessionStorage.getItem('maxPrice');
    const savedGender = sessionStorage.getItem('gender');

    // Only restore if we're not coming from home page filtering
    const isFromHomeFilter = sessionStorage.getItem('filterType');
    
    if (savedPage && !isFromHomeFilter) {
      setCurrentPage(Number(savedPage));
      
      // Restore filters from sessionStorage
      if (savedSearch) setSearch(savedSearch);
      if (savedBrands) setSelectedBrands(JSON.parse(savedBrands));
      if (savedMaxPrice) setMaxPrice(Number(savedMaxPrice));
      if (savedGender) setGender(savedGender);
      
      // Store the scroll position in a ref to be used after data has loaded
      if (savedScrollY) {
        scrollPositionRef.current = Number(savedScrollY);
      }
      
      // Clean up the sessionStorage to prevent it from being used again
      sessionStorage.removeItem('currentPage');
      sessionStorage.removeItem('scrollY');
      sessionStorage.removeItem('search');
      sessionStorage.removeItem('selectedBrands');
      sessionStorage.removeItem('maxPrice');
      sessionStorage.removeItem('gender');
    } else if (!isFromHomeFilter) {
      // If no state is saved and not from home filter, scroll to top
      window.scrollTo(0, 0);
    }
  }, []);

  // Updated useEffect to restore scroll position AFTER products have loaded with a delay
  useEffect(() => {
    // Only scroll if there is a saved position and we are no longer loading
    if (scrollPositionRef.current !== null && !loading) {
      const timeoutId = setTimeout(() => {
        window.scrollTo(0, scrollPositionRef.current);
        scrollPositionRef.current = null;
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [loading]);

  // Memoized filter options to avoid re-rendering unnecessarily
  const brandsForFilters = useMemo(() => allAvailableBrands, [allAvailableBrands]);
  const gendersForFilters = useMemo(() => allAvailableGenders, [allAvailableGenders]);

  // --- HANDLERS ---

  // Function to save the current page and scroll position before navigating
  const saveStateBeforeNavigate = () => {
    sessionStorage.setItem('currentPage', currentPage);
    sessionStorage.setItem('scrollY', window.scrollY);
    sessionStorage.setItem('search', search);
    sessionStorage.setItem('selectedBrands', JSON.stringify(selectedBrands));
    sessionStorage.setItem('maxPrice', maxPrice);
    sessionStorage.setItem('gender', gender);
  };
  
  // Handler for adding to cart with animation
  const handleAddToCart = (e, product) => {
  e.preventDefault();
  e.stopPropagation();
  addToCart(product);
  
  // Trigger both button and cart animations
  setAnimatingProduct(product.id);
  setCartAnimating(true);
  
  setTimeout(() => {
    setAnimatingProduct(null);
    setCartAnimating(false);
  }, 600); // Match the animation duration
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

  // Pagination handlers
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

  // Renders the page number buttons
  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxPageButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

    if (endPage - startPage + 1 < maxPageButtons) {
      startPage = Math.max(1, endPage - maxPageButtons + 1);
    }
    if (startPage > endPage) {
      startPage = endPage;
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <button
          key={i}
          onClick={() => goToPage(i)}
          className={`pagination-btn ${currentPage === i ? 'active' : ''}`}
        >
          {i}
        </button>
      );
    }
    return pageNumbers;
  };

  // --- COMPONENT JSX ---
  return (
    <div style={{ 
      padding: '20px',
      paddingTop: "100px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      minHeight: "100vh",
      margin: 0,
      overflowX: "hidden",
      fontFamily: "Montserrat, sans-serif",
      color: "#333"
    }}>

      <Navbar />

      <Link className="pluteologo" to="/">
        <img className="pluteologo" src={pluteologo} alt="Pluteo Logo" />
      </Link>

      {/* Fixed "See Cart" button with item count */}
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

      <Link className="pluteologomobile" to="/">
        <img className="pluteologomobile" src={pluteologo} alt="Pluteo Logo" />
      </Link>

      <div className="all-products">
        {selectedBrands.length > 0 ? 
          `${selectedBrands.length > 5 ? 'Filtered' : selectedBrands.join(', ')} Parfumes` : 
          'All Parfumes'
        }
      </div>

      {/* FIXED SEARCH BAR */}
      <div className="fixed-search-bar">
        <input
          type="text"
          placeholder="Search by name or brand..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="filter-search"
        />
      </div>

      {/* Filters Accordion */}
      <div className="filters-wrapper">
        <button
          className="filters-toggle"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>

        <div className={`filters ${showFilters ? "show" : "hide"}`}>
          {/* Brand multi-select */}
          <div className="brand-checkboxes">
            {brandsForFilters.length > 0 ? (
              brandsForFilters.map((b, idx) => (
                <label key={idx} className="brand-label">
                  <input
                    type="checkbox"
                    value={b}
                    checked={tempSelectedBrands.includes(b)}
                    onChange={handleTempBrandChange}
                  />
                  {b}
                </label>
              ))
            ) : (
              <p>No brands available.</p>
            )}
          </div>

          {/* Price range */}
          <div className="price-filter">
            <label>
              Max Price: $
              {(typeof tempMaxPrice === 'number' && !isNaN(tempMaxPrice) ? tempMaxPrice : 0).toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max={overallMaxProductPrice}
              value={tempMaxPrice}
              onChange={e => setTempMaxPrice(Number(e.target.value))}
            />
          </div>

          {/* Gender filter */}
          <select
            value={tempGender}
            onChange={e => setTempGender(e.target.value)}
            className="gender-select"
          >
            <option value="">All Genders</option>
            {gendersForFilters.length > 0 ? (
              gendersForFilters.map((g, idx) => (
                <option key={idx} value={g.toLowerCase()}>{g}</option>
              ))
            ) : (
              null
            )}
          </select>

          {/* Filter buttons */}
          <div className="filter-buttons">
            <button className="apply-btn" onClick={applyFilters}>Apply Filters</button>
            <button className="reset-btn" onClick={resetFilters}>Reset Filters</button>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Loading products...</p>
      ) : (
        <>
          <div className="product-grid">
            {products.length > 0 ? (
              products.map(product => (
                <Link 
                  to={`/product/${product.id}`} 
                  className="product-card-link" 
                  key={product.id}
                  onClick={saveStateBeforeNavigate}
                >
                  <div className="product-card">
                    <div className="product-top">
                      <img
                        className="productImage"
                        src={`${API_BASE_URL}${product.image}`}
                        alt={product.name}
                      />
                    </div>
                    <div className="product-bottom">
                      <div className="product-info">
                        <div className="product-name">{product.name}</div>
                        <div className="product-brand">{product.brand}</div>
                      </div>
                      <div className="price-add-to-cart">
                        <p className="product-price">{(typeof product.price === 'number' ? product.price : 0).toFixed(2)}€</p>
                        <button
                          className={`add-to-cart-btn ${animatingProduct === product.id ? 'added' : ''}`}
                          onClick={(e) => handleAddToCart(e, product)}
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p>No products match your current filters or are available.</p>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={goToPrevPage} disabled={currentPage === 1}>
                Previous
              </button>
              {renderPageNumbers()}
              <button onClick={goToNextPage} disabled={currentPage === totalPages}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}