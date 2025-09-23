import "../styles/Aboutus.css"
import Navbar from "../components/Navbar";

const Aboutus = () => {
  return (

    <div className="about-container">
        <Navbar />
      <h1 className="about-title">About Us</h1>
      <p className="about-text">
        At Pluteo, we believe everyone deserves to experience the power of scent. We specialize in offering a wide range of perfumes — from timeless classics to modern favorites — all at prices that won’t break the bank.
      </p>
      <p className="about-text">
        We’re passionate about fragrances, and our mission is to make luxury accessible. With countless perfumes from trusted brands, Pluteo is your go-to destination for finding the perfect scent. Affordable, reliable, and dedicated to our customers — that’s who we are.
      </p>
    </div>
  );
};

export default Aboutus;
