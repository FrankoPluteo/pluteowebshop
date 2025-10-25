// webshop-backend/testEmail.js
require("dotenv").config();
const nodemailer = require("nodemailer");

async function testEmail() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT),
      secure: false, // port 587 uses STARTTLS, not SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false, // <-- this line fixes the error
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "✅ Test Email from Pluteo Backend",
      text: "If you received this, your email setup works correctly!",
    });

    console.log("✅ Test email sent:", info.response);
  } catch (err) {
    console.error("❌ Email test failed:", err);
  }
}

testEmail();
