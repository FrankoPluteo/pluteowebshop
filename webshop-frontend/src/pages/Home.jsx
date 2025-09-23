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
    "Dolce & Gabbana",
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
    "JPG",
    "Hugo Boss"
    // Add more designer brands as needed
  ];

  const handleNicheClick = () => {
    // Store filter data in sessionStorage to be picked up by Products component
    sessionStorage.setItem('filterType', 'niche');
    sessionStorage.setItem('selectedBrands', JSON.stringify(nicheBrands));
    navigate('/products');
  };

  const handleDesignerClick = () => {
    // Store filter data in sessionStorage to be picked up by Products component
    sessionStorage.setItem('filterType', 'designer');
    sessionStorage.setItem('selectedBrands', JSON.stringify(designerBrands));
    navigate('/products');
  };

  return (
    <div>
      <Navbar />

      <div className="home-background">
        <div className="logo-shop-nishane">
          <div className="logo-shop">
            <img className="pluteologohome" src={pluteologo} alt="Pluteo Logo" />
            <Link to="/products" className="go-to-shop">SHOP</Link>
          </div>
          <img className="nishanejoemalone" src={nishanejoemalone} alt="Nishane and Jo Malone perfumes" />
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