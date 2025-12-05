import { Link, useNavigate } from "react-router-dom";
import "../styles/Home.css";
import Navbar from "../components/Navbar";
import pluteoLogoLong from "../../public/pluteo_logo_long.svg";
import xerjoff from "../images/xerjoff.jpg";
import erosflame from "../images/erosflame.jpg";

function Home() {
  const navigate = useNavigate();

  // Define your niche and designer brands here
  const nicheBrands = [
    "Montale Paris",
    "Nishane",
    "Creed",
    "Tom Ford",
    "Parfums de Marly",
    "Tiziana Terenzi",
    "Initio",
    "Van Cleef & Arpels",
    "Xerjoff",
    "Cartier",
    "Guerlain",
    "Jo Malone"
  ];


  const designerBrands = [
    "Tom Ford",
    "Cartier",
    "Yves Saint Laurent",
    "Marc Jacobs",
    "Narciso Rodriguez",
    "Dior",
    "Mugler",
    "Bvlgari",
    "Paco Rabanne",
    "Nina Ricci",
    "Givenchy",
    "Lancome",
    "Dolce & Gabbana",
    "Montblanc",
    "Burberry",
    "Prada",
    "Shiseido",
    "Cacharel",
    "Chloe",
    "Gucci",
    "Lalique",
    "Michael Kors",
    "Giorgio Armani",
    "Versace",
    "Valentino",
    "Calvin Klein",
    "Davidoff",
    "Chanel",
    "Jean Paul Gaultier"
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

  const handleMensClick = () => {
    // Clear sessionStorage first
    sessionStorage.clear();
    
    // Store filter data in sessionStorage to be picked up by Products component
    sessionStorage.setItem('gender', 'male');
    sessionStorage.setItem('currentPage', '1');
    
    navigate('/products', { state: { applyFilters: true } });
  };

  const handleWomensClick = () => {
    // Clear sessionStorage first
    sessionStorage.clear();
    
    // Store filter data in sessionStorage to be picked up by Products component
    sessionStorage.setItem('gender', 'female');
    sessionStorage.setItem('currentPage', '1');
    
    navigate('/products', { state: { applyFilters: true } });
  };

  return (
    <div>
      <Navbar />

      <div className="home-background">
        <img className="pluteo-logo-long" src={pluteoLogoLong}></img>
        <Link to="/products" className="go-to-shop" state={{ fromHome: true }}>SHOP</Link>

        <div className="filter-link-box">
          <div className="filter-link" onClick={handleMensClick}>MEN'S</div>
          <div className="filter-link" onClick={handleWomensClick}>WOMEN'S</div>
          <div className="filter-link" onClick={handleNicheClick}>NICHE</div>
          <div className="filter-link" onClick={handleDesignerClick}>DESIGNER</div>
        </div>

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