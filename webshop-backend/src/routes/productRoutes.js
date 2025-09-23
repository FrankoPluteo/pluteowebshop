// src/routes/productRoutes.js
const express = require("express");
const router = express.Router();

const {
  getAllProducts,
  createProduct,
  getProductsMetadata,
  getSingleProduct // <--- ADD THIS LINE
} = require("../controllers/productController");

router.get("/", getAllProducts);
router.post("/", createProduct); // optional for now

router.get("/metadata", getProductsMetadata);

router.get("/:id", getSingleProduct); // <--- ADD THIS NEW ROUTE for single product

module.exports = router;