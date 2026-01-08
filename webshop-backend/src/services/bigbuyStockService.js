// src/services/bigbuyStockService.js
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BIGBUY_USE_SANDBOX = process.env.BIGBUY_USE_SANDBOX === "true";
const BIGBUY_API_KEY = BIGBUY_USE_SANDBOX
  ? process.env.BIGBUY_API_KEY_SANDBOX
  : process.env.BIGBUY_API_KEY_PROD;

const BIGBUY_BASE_URL = BIGBUY_USE_SANDBOX
  ? "https://api.sandbox.bigbuy.eu"
  : "https://api.bigbuy.eu";

/**
 * Fetch stock for all products from BigBuy and update database
 * OPTIMIZED: Only fetches stock for products that exist in our database
 */
async function updateAllProductStock() {
  if (!BIGBUY_API_KEY) {
    console.error("BigBuy API key not configured");
    return { success: false, updated: 0, errors: ["API key not configured"] };
  }

  try {
    // ✅ STEP 1: Get all YOUR products from database that have BigBuy SKUs
    const ourProducts = await prisma.products.findMany({
      where: {
        urllink: { not: null },
      },
      select: {
        id: true,
        name: true,
        urllink: true,
      },
    });

    if (ourProducts.length === 0) {
      console.log("⚠️  No products with BigBuy SKUs found in database");
      return { success: true, updated: 0, total: 0, errors: [] };
    }

    console.log(`📦 Found ${ourProducts.length} products in your shop`);
    console.log(`📋 Your SKUs: ${ourProducts.map(p => p.urllink).join(', ')}`);

    // Create a map of SKU -> product for quick lookup
    const productMap = new Map();
    ourProducts.forEach(p => {
      if (p.urllink) {
        // Store both uppercase and original case for matching
        productMap.set(p.urllink.toUpperCase(), p);
        productMap.set(p.urllink, p);
      }
    });

    const headers = {
      Authorization: `Bearer ${BIGBUY_API_KEY}`,
      "Content-Type": "application/json",
    };

    // ✅ STEP 2: Fetch stock from BigBuy
    const url = `${BIGBUY_BASE_URL}/rest/catalog/productsstockbyhandlingdays.json`;
    
    console.log(`🔄 Fetching stock from BigBuy...`);
    const response = await axios.get(url, { headers });
    const allStockData = response.data;

    if (!Array.isArray(allStockData)) {
      throw new Error("Invalid response format from BigBuy");
    }

    console.log(`📊 BigBuy returned stock for ${allStockData.length} products`);

    // Debug: Show first few items to see the structure
    if (allStockData.length > 0) {
      console.log(`🔍 Sample BigBuy response (first item):`, JSON.stringify(allStockData[0], null, 2));
    }

    let updated = 0;
    let matched = 0;
    const errors = [];
    const matchedSKUs = new Set();

    // ✅ STEP 3: Only process stock for products that exist in OUR database
    for (const item of allStockData) {
      const bigbuySku = item.sku;
      
      if (!bigbuySku) {
        continue; // Skip items without SKU
      }

      // Try matching with both original case and uppercase
      const ourProduct = productMap.get(bigbuySku) || productMap.get(bigbuySku.toUpperCase());
      
      if (!ourProduct) {
        // Skip products we don't have
        continue;
      }

      matched++;
      matchedSKUs.add(bigbuySku);

      try {
        // Calculate total stock across all handling days
        let totalStock = 0;
        if (item.stocks && Array.isArray(item.stocks)) {
          totalStock = item.stocks.reduce((sum, s) => sum + (s.quantity || 0), 0);
        }

        console.log(`📦 Processing ${ourProduct.name}:`);
        console.log(`   - BigBuy SKU: ${bigbuySku}`);
        console.log(`   - Stock data:`, JSON.stringify(item.stocks, null, 2));
        console.log(`   - Total stock: ${totalStock}`);

        // Update stock in database
        await prisma.products.update({
          where: { id: ourProduct.id },
          data: {
            stockQuantity: totalStock,
            lastStockCheck: new Date(),
          },
        });
        
        updated++;
        
        if (totalStock === 0) {
          console.log(`⚠️  ${ourProduct.name} (${bigbuySku}) - OUT OF STOCK`);
        } else {
          console.log(`✅ ${ourProduct.name} (${bigbuySku}) - Stock: ${totalStock}`);
        }
      } catch (err) {
        errors.push({
          sku: bigbuySku,
          error: err.message,
        });
        console.error(`❌ Error updating stock for ${bigbuySku}:`, err.message);
      }
    }

    // Check which of our products were NOT found in BigBuy response
    // These are likely temporarily unavailable or discontinued
    const notFoundProducts = ourProducts
      .filter(p => !matchedSKUs.has(p.urllink) && !matchedSKUs.has(p.urllink?.toUpperCase()));

    if (notFoundProducts.length > 0) {
      console.log(`\n⚠️  Products NOT found in BigBuy stock response (setting to OUT OF STOCK):`);
      
      for (const product of notFoundProducts) {
        try {
          // Set stock to 0 for products not in BigBuy response
          await prisma.products.update({
            where: { id: product.id },
            data: {
              stockQuantity: 0,
              lastStockCheck: new Date(),
            },
          });
          
          updated++;
          console.log(`   ⚠️  ${product.name} (${product.urllink}) - Set to OUT OF STOCK (not in BigBuy response)`);
        } catch (err) {
          console.error(`   ❌ Error updating ${product.urllink}:`, err.message);
        }
      }
      
      console.log(`\n💡 Note: Products not in BigBuy's stock response are either temporarily unavailable or discontinued.`);
    }

    console.log(`\n✅ Stock update complete:`);
    console.log(`   - Updated: ${updated}/${ourProducts.length} products`);
    console.log(`   - Found in BigBuy: ${matched} products`);
    console.log(`   - Set to OUT OF STOCK (not in response): ${ourProducts.length - matched}`);
    
    if (errors.length > 0) {
      console.log(`   - Errors: ${errors.length}`);
    }

    return {
      success: true,
      updated,
      matched,
      total: ourProducts.length,
      setToZero: ourProducts.length - matched,
      errors,
    };
  } catch (error) {
    console.error("❌ Error fetching stock from BigBuy:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    return {
      success: false,
      updated: 0,
      errors: [error.message],
    };
  }
}

/**
 * Get stock for a single product by BigBuy SKU
 * @param {string} bigbuySku - The BigBuy SKU (stored in urllink field)
 * @returns {Promise<number>} - Total stock quantity
 */
async function getProductStock(bigbuySku) {
  if (!BIGBUY_API_KEY || !bigbuySku) {
    return 0;
  }

  try {
    const headers = {
      Authorization: `Bearer ${BIGBUY_API_KEY}`,
      "Content-Type": "application/json",
    };

    const url = `${BIGBUY_BASE_URL}/rest/catalog/productsstockbyhandlingdays.json`;
    const response = await axios.get(url, { headers });
    const stockData = response.data;

    // Find the product in the response
    const productStock = stockData.find(item => 
      item.sku === bigbuySku || 
      item.sku?.toUpperCase() === bigbuySku?.toUpperCase()
    );
    
    if (!productStock) {
      return 0;
    }

    // Calculate total stock
    let totalStock = 0;
    if (productStock.stocks && Array.isArray(productStock.stocks)) {
      totalStock = productStock.stocks.reduce((sum, s) => sum + (s.quantity || 0), 0);
    }

    return totalStock;
  } catch (error) {
    console.error(`Error fetching stock for SKU ${bigbuySku}:`, error.message);
    return 0;
  }
}

/**
 * Check if a product is in stock (from database)
 * @param {number} productId - Database product ID
 * @returns {Promise<{inStock: boolean, quantity: number}>}
 */
async function checkProductStock(productId) {
  try {
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: { stockQuantity: true, lastStockCheck: true },
    });

    if (!product) {
      return { inStock: false, quantity: 0 };
    }

    const quantity = product.stockQuantity || 0;
    
    return {
      inStock: quantity > 0,
      quantity,
      lastChecked: product.lastStockCheck,
    };
  } catch (error) {
    console.error(`Error checking stock for product ${productId}:`, error.message);
    return { inStock: false, quantity: 0 };
  }
}

module.exports = {
  updateAllProductStock,
  getProductStock,
  checkProductStock,
};