// webshop-backend/src/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Log the connection attempt (hide password)
    const uriWithoutPassword = process.env.MONGODB_URI.replace(
      /:([^@]+)@/,
      ':****@'
    );
    console.log(`🔄 Attempting to connect to MongoDB...`);
    console.log(`URI (masked): ${uriWithoutPassword}`);

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
    
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error:`);
    console.error(`   Message: ${error.message}`);
    
    // Provide specific error hints
    if (error.message.includes('Authentication failed')) {
      console.error(`   → Check your username and password in MONGODB_URI`);
      console.error(`   → Make sure special characters are URL-encoded`);
    } else if (error.message.includes('ENOTFOUND')) {
      console.error(`   → Check your cluster hostname in MONGODB_URI`);
    } else if (error.message.includes('IP')) {
      console.error(`   → Check MongoDB Atlas Network Access settings`);
      console.error(`   → Add 0.0.0.0/0 to allow all IPs (for testing)`);
    }
    
    throw error; // Re-throw to be caught in server.js
  }
};

module.exports = connectDB;