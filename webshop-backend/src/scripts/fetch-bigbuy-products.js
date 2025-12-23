// fetch-bigbuy-available-products.js
// Fetch products with stock from BigBuy sandbox
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

console.log(`\n🔍 Fetching available products from BigBuy (${BIGBUY_USE_SANDBOX ? 'SANDBOX' : 'PRODUCTION'})`);
console.log(`Base URL: ${BIGBUY_BASE_URL}\n`);

async function getProductsWithStock() {
  try {
    console.log("📦 Step 1: Fetching first-level taxonomies...");
    
    // Get first level taxonomies first
    const taxonomiesResponse = await axios.get(
      `${BIGBUY_BASE_URL}/rest/catalog/taxonomies.json`,
      {
        headers,
        params: {
          firstLevel: true,
        },
      }
    );
    
    if (!taxonomiesResponse.data || taxonomiesResponse.data.length === 0) {
      console.error("❌ No taxonomies found");
      return null;
    }
    
    const firstTaxonomy = taxonomiesResponse.data[0];
    console.log(`✅ Found taxonomy: ${firstTaxonomy.name} (ID: ${firstTaxonomy.id})\n`);
    
    console.log("📦 Step 2: Fetching products with stock...");
    
    // Get products stock by handling days (as per documentation)
    const stockResponse = await axios.get(
      `${BIGBUY_BASE_URL}/rest/catalog/productsstockbyhandlingdays.json`,
      {
        headers,
        params: {
          parentTaxonomy: firstTaxonomy.id,
        },
      }
    );

    console.log(`✅ Found ${stockResponse.data.length} products with stock info\n`);

    // Filter products that have stock available (in any handling time)
    const inStockProducts = stockResponse.data.filter(p => {
      if (!p.stocks || p.stocks.length === 0) return false;
      const totalStock = p.stocks.reduce((sum, s) => sum + s.quantity, 0);
      return totalStock > 0;
    });
    
    console.log(`✅ ${inStockProducts.length} products IN STOCK:\n`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Get detailed info for first 10 in-stock products
    for (let i = 0; i < Math.min(10, inStockProducts.length); i++) {
      const stockItem = inStockProducts[i];
      const totalStock = stockItem.stocks.reduce((sum, s) => sum + s.quantity, 0);
      
      try {
        // Get full product details
        const productResponse = await axios.get(
          `${BIGBUY_BASE_URL}/rest/catalog/product/${stockItem.id}.json`,
          { headers }
        );

        const product = productResponse.data;
        
        console.log(`\n${i + 1}. Product ID: ${stockItem.id}`);
        console.log(`   SKU: ${stockItem.sku}`);
        console.log(`   Total Stock: ${totalStock} units`);
        console.log(`   Wholesale Price: €${product.wholesalePrice || 'N/A'}`);
        console.log(`   Retail Price: €${product.retailPrice || 'N/A'}`);
        
        // Show stock breakdown by handling days
        stockItem.stocks.forEach(s => {
          if (s.quantity > 0) {
            console.log(`   - ${s.quantity} units (${s.minHandlingDays}-${s.maxHandlingDays} days)`);
          }
        });
        
        if (i === 0) {
          console.log(`\n   ⭐ RECOMMENDED: Use this SKU for testing!`);
          console.log(`   📝 UPDATE COMMAND: UPDATE products SET urllink = '${stockItem.sku}' WHERE id = 7;`);
        }
        
      } catch (err) {
        console.log(`\n${i + 1}. Product ID: ${stockItem.id}`);
        console.log(`   SKU: ${stockItem.sku}`);
        console.log(`   Total Stock: ${totalStock} units`);
        console.log(`   (Details not available: ${err.response?.data?.message || err.message})`);
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    if (inStockProducts.length > 0) {
      const firstProduct = inStockProducts[0];
      console.log("\n✅ TEST CONFIGURATION:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`1. Update your product:`);
      console.log(`   UPDATE products SET urllink = '${firstProduct.sku}' WHERE id = 7;`);
      console.log(`\n2. Remove sandbox bypass from .env:`);
      console.log(`   BIGBUY_SANDBOX_BYPASS=false`);
      console.log(`\n3. Test order with this product!`);
      
      return firstProduct.sku;
    } else {
      console.log("\n❌ No products with stock found in sandbox");
      console.log("💡 You may need to use the bypass or contact BigBuy support");
      return null;
    }

  } catch (err) {
    console.error("❌ Error fetching products:", err.response?.data || err.message);
    return null;
  }
}

async function testOrderWithProduct(sku) {
  console.log(`\n\n🧪 Testing order with product SKU: ${sku}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const payload = {
    order: {
      internalReference: `TEST_${Date.now()}`,
      language: "en",
      paymentMethod: "moneybox",
      shippingAddress: {
        firstName: "Franko",
        lastName: "Pavlic",
        country: "HR",
        postcode: "10000",
        town: "Zagreb",
        address: "Trg bana Josipa Jelacica 1",
        phone: "+385912345678",
        email: "test@example.com",
        comment: "",
      },
      products: [
        {
          reference: sku,
          quantity: 1,
        },
      ],
    },
  };

  try {
    console.log("📤 Sending CHECK request to BigBuy...");
    const response = await axios.post(
      `${BIGBUY_BASE_URL}/rest/order/check/multishipping.json`,
      payload,
      { headers }
    );

    console.log("\n✅ ORDER CHECK SUCCESSFUL!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Response from BigBuy:");
    console.log(JSON.stringify(response.data, null, 2));
    
    console.log("\n🎉 This product works in sandbox!");
    console.log("✅ You can now disable BIGBUY_SANDBOX_BYPASS and test real orders");
    
    return true;
  } catch (err) {
    console.error("\n❌ ORDER CHECK FAILED:");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(err.response?.data || err.message);
    
    console.log("\n💡 This product might not work. Try another SKU from the list above.");
    
    return false;
  }
}

async function run() {
  const sku = await getProductsWithStock();
  
  if (sku) {
    // Wait a bit before testing
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testOrderWithProduct(sku);
  }
}

run();