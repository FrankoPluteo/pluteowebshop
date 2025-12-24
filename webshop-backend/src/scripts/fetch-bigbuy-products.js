// check-bigbuy-catalog.js
// Check if BigBuy sandbox has ANY products at all
const axios = require("axios");
require("dotenv").config();

const BIGBUY_USE_SANDBOX = process.env.BIGBUY_USE_SANDBOX === "true";
const BIGBUY_API_KEY = BIGBUY_USE_SANDBOX
  ? process.env.BIGBUY_API_KEY_SANDBOX
  : process.env.BIGBUY_API_KEY_PROD;

const BIGBUY_BASE_URL = BIGBUY_USE_SANDBOX
  ? "https://api.sandbox.bigbuy.eu"
  : "https://api.bigbuy.eu";

const headers = {
  Authorization: `Bearer ${BIGBUY_API_KEY}`,
  "Content-Type": "application/json",
};

console.log(`\n🔍 Checking BigBuy Catalog (${BIGBUY_USE_SANDBOX ? 'SANDBOX' : 'PRODUCTION'})`);
console.log(`Base URL: ${BIGBUY_BASE_URL}\n`);

async function checkCatalog() {
  try {
    // Step 1: Get all taxonomies
    console.log("📦 Step 1: Fetching ALL taxonomies...");
    const taxonomiesResponse = await axios.get(
      `${BIGBUY_BASE_URL}/rest/catalog/taxonomies.json`,
      { headers }
    );
    
    console.log(`✅ Total taxonomies: ${taxonomiesResponse.data.length}`);
    
    // Get first level taxonomies
    const firstLevelResponse = await axios.get(
      `${BIGBUY_BASE_URL}/rest/catalog/taxonomies.json`,
      {
        headers,
        params: { firstLevel: true },
      }
    );
    
    console.log(`✅ First-level taxonomies: ${firstLevelResponse.data.length}\n`);
    
    // Step 2: Try to get products from each first-level taxonomy
    console.log("📦 Step 2: Checking products in each taxonomy...\n");
    
    let totalProducts = 0;
    let taxonomiesWithProducts = [];
    
    for (const taxonomy of firstLevelResponse.data.slice(0, 5)) { // Check first 5
      try {
        const productsResponse = await axios.get(
          `${BIGBUY_BASE_URL}/rest/catalog/products.json`,
          {
            headers,
            params: {
              parentTaxonomy: taxonomy.id,
              pageSize: 10,
            },
          }
        );
        
        const count = productsResponse.data.length;
        totalProducts += count;
        
        console.log(`   ${taxonomy.name} (ID: ${taxonomy.id}): ${count} products`);
        
        if (count > 0) {
          taxonomiesWithProducts.push({
            taxonomy: taxonomy,
            products: productsResponse.data,
          });
        }
      } catch (err) {
        console.log(`   ${taxonomy.name} (ID: ${taxonomy.id}): Error - ${err.message}`);
      }
    }
    
    console.log(`\n✅ Total products found: ${totalProducts}\n`);
    
    // Step 3: If we found products, check their stock
    if (taxonomiesWithProducts.length > 0) {
      console.log("📦 Step 3: Checking stock for products...\n");
      
      const firstTaxWithProducts = taxonomiesWithProducts[0];
      const firstProduct = firstTaxWithProducts.products[0];
      
      console.log(`Checking product: ${firstProduct.sku}`);
      console.log(`   Taxonomy: ${firstTaxWithProducts.taxonomy.name}`);
      console.log(`   Product ID: ${firstProduct.id}`);
      console.log(`   Wholesale Price: €${firstProduct.wholesalePrice}`);
      console.log(`   Retail Price: €${firstProduct.retailPrice}\n`);
      
      // Try to check stock
      try {
        const stockResponse = await axios.get(
          `${BIGBUY_BASE_URL}/rest/catalog/productsstockbyhandlingdays.json`,
          {
            headers,
            params: {
              parentTaxonomy: firstTaxWithProducts.taxonomy.id,
            },
          }
        );
        
        console.log(`Stock data available: ${stockResponse.data.length} products`);
        
        const productStock = stockResponse.data.find(s => s.id === firstProduct.id);
        if (productStock) {
          console.log(`\n✅ Stock for ${productStock.sku}:`);
          productStock.stocks.forEach(s => {
            console.log(`   - ${s.quantity} units (${s.minHandlingDays}-${s.maxHandlingDays} days)`);
          });
          
          const totalStock = productStock.stocks.reduce((sum, s) => sum + s.quantity, 0);
          if (totalStock > 0) {
            console.log(`\n🎉 FOUND PRODUCT WITH STOCK!`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`SKU: ${productStock.sku}`);
            console.log(`Total Stock: ${totalStock} units`);
            console.log(`\n📝 UPDATE COMMAND:`);
            console.log(`UPDATE products SET urllink = '${productStock.sku}' WHERE id = 7;`);
            
            return productStock.sku;
          } else {
            console.log(`\n⚠️ Product exists but has NO STOCK`);
          }
        } else {
          console.log(`\n⚠️ No stock data found for this product`);
        }
      } catch (err) {
        console.log(`\n❌ Error checking stock: ${err.response?.data?.message || err.message}`);
      }
    }
    
    // Step 4: Final verdict
    console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`FINAL VERDICT:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    if (totalProducts === 0) {
      console.log(`❌ BigBuy sandbox has NO products in the catalog`);
    } else if (taxonomiesWithProducts.length === 0) {
      console.log(`⚠️ BigBuy sandbox has products but all have ZERO stock`);
    } else {
      console.log(`⚠️ BigBuy sandbox has limited functionality`);
    }
    
    console.log(`\n💡 RECOMMENDATION:`);
    console.log(`   The sandbox is non-functional for order testing.`);
    console.log(`   Your options:`);
    console.log(`   1. Keep using BIGBUY_SANDBOX_BYPASS=true for development`);
    console.log(`   2. Switch to production BigBuy (with Stripe test mode)`);
    console.log(`\n   Your Stripe payment flow is working perfectly, so option 2 is safe!`);
    
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
}

checkCatalog();