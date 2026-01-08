// src/routes/stockRoutes.js
const express = require("express");
const router = express.Router();
const { 
  updateAllProductStock, 
  checkProductStock 
} = require("../services/bigbuyStockService");

// GET /api/stock/update - Manually trigger stock update
router.get("/update", async (req, res) => {
  try {
    console.log("🔄 Manual stock update triggered");
    const result = await updateAllProductStock();
    
    res.json({
      success: result.success,
      message: `Updated ${result.updated} products`,
      details: result,
    });
  } catch (error) {
    console.error("Error updating stock:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update stock" 
    });
  }
});

// GET /api/stock/:productId - Check stock for specific product
router.get("/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const stockInfo = await checkProductStock(productId);
    
    res.json(stockInfo);
  } catch (error) {
    console.error("Error checking stock:", error);
    res.status(500).json({ 
      error: "Failed to check stock" 
    });
  }
});

module.exports = router;