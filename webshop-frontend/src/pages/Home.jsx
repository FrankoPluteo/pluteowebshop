import { Link, useNavigate } from "react-router-dom";
import "../styles/Home.css";
import Navbar from "../components/Navbar";
import pluteologo from "../images/pluteologo.svg";
import nishanejoemalone from "../images/nishanejomalone.svg";
import xerjoff from "../images/xerjoff.jpg";
import erosflame from "../images/erosflame.jpg";

function Home() {
  const navigate = useNavigate();

  // Define your niche and designer brands here
  const nicheBrands = [
    "Nishane",
    "Creed",
    "Xerjoff",
    "Jo Malone",
    "Initio",
    "Parfums de Marly",
    "Tiziana Terenzi"
  ];

  const designerBrands = [
    "Versace",
    "Dolce&Gabbana",
    "Dior",
    "Chanel",
    "Givenchy",
    "Gucci",
    "Lancome",
    "Narciso Rodriguez",
    "Yves Saint Laurent",
    "Tom Ford",
    "Valentino",
    "Armani",
    "Prada",
    "Paco Rabanne",
    "Jean Paul Gaultier",
    "Hugo Boss"
  ];

  const handleNicheClick = () => {
    // Clear sessionStorage first
    sessionStorage.clear();
    
    // Store filter data in sessionStorage to be picked up by Products component
    sessionStorage.setItem('selectedBrands', JSON.stringify(nicheBrands));
    sessionStorage.setItem('currentPage', '1');
    
    navigate('/products', { state: { applyFilters: true } });
  };

  const handleDesignerClick = () => {
    // Clear sessionStorage first
    sessionStorage.clear();
    
    // Store filter data in sessionStorage to be picked up by Products component
    sessionStorage.setItem('selectedBrands', JSON.stringify(designerBrands));
    sessionStorage.setItem('currentPage', '1');
    
    navigate('/products', { state: { applyFilters: true } });
  };

  return (
    <div>
      <Navbar />

      <div className="home-background">
        <Link to="/products" className="go-to-shop" state={{ fromHome: true }}>SHOP</Link>
      </div>

      <div className="home-2">
        <div className="home-2-1">
          <img src={xerjoff} className="xerjoffhome" alt="Xerjoff perfume" />
          <button className="shop-niche" onClick={handleNicheClick}>
            SHOP NICHE
          </button>
        </div>

        <div className="home-2-2">
          <img id="erosflame" src={erosflame} className="xerjoffhome" alt="Eros Flame perfume" />
          <button className="shop-niche" onClick={handleDesignerClick}>
            SHOP DESIGNER
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;