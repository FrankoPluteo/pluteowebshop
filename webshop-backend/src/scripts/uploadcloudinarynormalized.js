// src/scripts/uploadCloudinaryNormalized.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const slugify = require('slugify');
const mongoose = require('mongoose');
const Product = require('../models/Product'); // adjust path if needed

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Normalize function
const normalizeName = (name) => {
  return slugify(name, {
    lower: false,         // keep capitalization
    remove: /[*+~.()'"!:@]/g, // remove special chars
  });
};

const uploadImages = async () => {
  try {
    // Connect to DB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const products = await Product.find({});
    console.log(`Found ${products.length} products in DB.`);

    for (const product of products) {
      const normalizedName = normalizeName(product.name);
      const localImagePath = path.join(
        __dirname,
        '../../images', // adjust to your images folder
        `${normalizedName}.jpg` // assuming .jpg, adjust if .png
      );

      if (!fs.existsSync(localImagePath)) {
        console.log(`❌ Image file not found for product "${product.name}"`);
        continue;
      }

      try {
        const result = await cloudinary.uploader.upload(localImagePath, {
          folder: 'products',
          public_id: normalizedName,
          overwrite: true,
        });

        // Save the Cloudinary URL in your product DB (optional)
        product.imageUrl = result.secure_url;
        await product.save();

        console.log(`✅ Uploaded "${product.name}" as "${normalizedName}"`);
      } catch (err) {
        console.error(`❌ Failed to upload "${product.name}": ${err.message}`);
      }
    }

    console.log('All done!');
    mongoose.disconnect();
  } catch (err) {
    console.error(err);
    mongoose.disconnect();
  }
};

uploadImages();
