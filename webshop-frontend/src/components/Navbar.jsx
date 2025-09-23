import { Link } from "react-router-dom";
import "../styles/Navbar.css"; // The styling is now simplified as well

// This is the reusable Navbar component.
export default function Navbar() {
  return (
    <div className="navbar">
      <Link to="/" className="navbar-link">HOME</Link>
      <Link to="/products" id="shop" className="navbar-link">SHOP</Link>
      <Link to="/aboutus" className="navbar-link">ABOUT</Link>
      <Link to="/contact" className="navbar-link">CONTACT</Link>
    </div>
  );
}
