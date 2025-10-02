require("dotenv").config();
const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const cloudinary = require("cloudinary").v2;
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const IMAGES_FOLDER = path.join(__dirname, "../../public/images");

async function uploadImages() {
  try {
    const files = fs.readdirSync(IMAGES_FOLDER);

    for (const file of files) {
      const filePath = path.join(IMAGES_FOLDER, file);
      const fileNameWithoutExt = path.parse(file).name;

      // Slugify product name for consistent Cloudinary public_id
      const publicId = slugify(fileNameWithoutExt, { lower: true, strict: true });

      try {
        const result = await cloudinary.uploader.upload(filePath, {
          folder: "products",
          public_id: publicId, // enforce same ID each time
          overwrite: true, // replaces duplicates
          unique_filename: false, // don’t add random suffixes
        });

        console.log(`✅ ${file} uploaded as ${result.public_id}: ${result.secure_url}`);

        // Update DB with new Cloudinary image URL
        const updated = await prisma.products.updateMany({
          where: { name: fileNameWithoutExt },
          data: { image: result.secure_url },
        });

        if (updated.count === 0) {
          console.warn(`⚠️ No product found in DB with name: ${fileNameWithoutExt}`);
        }
      } catch (err) {
        console.error(`❌ Error uploading ${file}:`, err.message);
      }
    }

    console.log("🎉 All images processed.");
  } catch (err) {
    console.error("Error reading images folder:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

uploadImages();
