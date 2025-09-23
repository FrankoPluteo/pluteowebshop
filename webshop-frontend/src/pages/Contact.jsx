// src/pages/Contact.jsx
import React, { useRef, useState, useEffect } from 'react';
import '../styles/Contact.css';
import emailjs from '@emailjs/browser';
import Navbar from "../components/Navbar.jsx";

export default function Contact() {
  const form = useRef();
  const [message, setMessage] = useState('');

  // Scroll to the top of the page when the component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setMessage('');

    emailjs.sendForm(
      'PluteoVontaGrupa', // Replace with your Service ID from EmailJS
      'template_rcb8z8m', // Replace with your Template ID from EmailJS
      form.current,
      'U-VGqRhP17jqYAgtd' // Replace with your Public Key from EmailJS
    ).then((result) => {
      console.log('Email successfully sent!', result.text);
      setMessage('Your message has been sent successfully! We will get back to you shortly.');
      form.current.reset(); // Reset the form fields on success
    }).catch((error) => {
      console.error('Failed to send email:', error.text);
      setMessage('Failed to send your message. Please try again later.');
    });
  };

  return (
    <div className="contact-container">

    <Navbar />

      <div className="contact-form-section">
        <h2>Send us a message</h2>
        <form ref={form} onSubmit={handleSubmit} className="contact-form">
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input type="text" id="name" name="name" required />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" name="email" required />
          </div>

          <div className="form-group">
            <label htmlFor="title">Subject</label>
            <input type="text" id="title" name="title" required />
          </div>

          <div className="form-group">
            <label htmlFor="message">Message</label>
            <textarea id="message" name="message" required></textarea>
          </div>

          <button type="submit" className="submit-btn">Send Message</button>
        </form>
        {message && <p className={`form-message ${message.includes('successfully') ? 'success' : 'error'}`}>{message}</p>}
      </div>

      <div className="contact-details-section">
        <h2>Quick Details</h2>
        <div className="details-card">
          <a href="mailto:your_email@gmail.com" className="detail-item">
            <i className="fa-solid fa-envelope"></i>
            <p>your_email@gmail.com</p>
          </a>
          <a href="https://www.instagram.com/your_username" target="_blank" rel="noopener noreferrer" className="detail-item">
            <i className="fa-brands fa-instagram"></i>
            <p>your_username</p>
          </a>
          <a href="https://www.tiktok.com/@your_username" target="_blank" rel="noopener noreferrer" className="detail-item">
            <i className="fa-brands fa-tiktok"></i>
            <p>your_username</p>
          </a>
        </div>
      </div>
    </div>
  );
}
