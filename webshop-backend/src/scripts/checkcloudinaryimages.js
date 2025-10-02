// src/scripts/checkCloudinaryImages.js
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function checkImages() {
  try {
    console.log("Fetching products from database...");
    const products = await prisma.products.findMany({
      select: { id: true, name: true, image: true } // Adjust if your field is 'imageUrl'
    });

    console.log(`Found ${products.length} products in DB.`);

    console.log("Fetching images from Cloudinary...");
    const cloudinaryImages = await cloudinary.api.resources({
      type: 'upload',
      prefix: 'products', // your folder
      max_results: 500 // adjust if you have more images
    });

    const cloudinaryImageNames = cloudinaryImages.resources.map(img => {
      const nameWithExt = img.public_id.split('/').pop(); // e.g., "Accento EDP"
      return nameWithExt;
    });

    console.log(`Found ${cloudinaryImageNames.length} images in Cloudinary.`);

    // Compare DB products with Cloudinary images
    products.forEach(product => {
      const baseName = product.name; // adjust if necessary
      const existsInCloudinary = cloudinaryImageNames.some(imgName =>
        imgName.toLowerCase() === baseName.toLowerCase()
      );

      if (!existsInCloudinary) {
        console.warn(`❌ Product "${product.name}" has no matching Cloudinary image.`);
      } else {
        console.log(`✅ Product "${product.name}" has an image in Cloudinary.`);
      }

      if (!product.image) {
        console.warn(`⚠️ Product "${product.name}" has no URL in DB.`);
      }
    });

  } catch (err) {
    console.error("Error checking images:", err);
  } finally {
    await prisma.$disconnect();
  }
}

checkImages();
