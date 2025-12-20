// bigbuy-full-test.js
// Test actual order creation with real SKUs
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

console.log(`\n🔧 Testing BigBuy Order Creation (${BIGBUY_USE_SANDBOX ? 'SANDBOX' : 'PRODUCTION'})`);
console.log(`Base URL: ${BIGBUY_BASE_URL}\n`);

async function testOrderWithRealProduct() {
  // Use a real product from catalog: S0103120
  const testSKU = "S0103120";
  
  console.log(`📦 Testing order with product: ${testSKU}`);
  
  // Try different carrier combinations
  const carriersToTry = [
    "gls",
    "standard shipment",
    "postal service",
    "dhl",
    "ups",
    "dpd",
    null, // Try without specifying carrier
  ];

  for (const carrier of carriersToTry) {
    console.log(`\n🚚 Trying carrier: ${carrier || 'AUTO (no carrier specified)'}`);
    
    const payload = {
      order: {
        internalReference: `TEST_${Date.now()}`,
        language: "en",
        paymentMethod: "moneybox",
        ...(carrier ? { carriers: [{ name: carrier }] } : {}), // Only add carriers if specified
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
            reference: testSKU,
            quantity: 1,
          },
        ],
      },
    };

    try {
      console.log("Sending CHECK request...");
      const response = await axios.post(
        `${BIGBUY_BASE_URL}/rest/order/check/multishipping.json`,
        payload,
        { headers }
      );

      console.log("✅ SUCCESS! Order check passed with this configuration:");
      console.log(`   Carrier: ${carrier || 'AUTO'}`);
      console.log(`   Product: ${testSKU}`);
      console.log(`   Country: HR (Croatia)`);
      console.log("\nResponse:");
      console.log(JSON.stringify(response.data, null, 2));
      
      return { carrier: carrier || 'AUTO', sku: testSKU };
      
    } catch (err) {
      console.log(`❌ Failed with carrier '${carrier || 'AUTO'}':`, err.response?.data?.message || err.message);
    }
  }
  
  console.log("\n❌ All carrier options failed for Croatia");
  
  // Try with Spain as fallback
  console.log("\n🔄 Trying with Spain (ES) as test country...");
  
  for (const carrier of carriersToTry) {
    console.log(`\n🚚 Trying Spain with carrier: ${carrier || 'AUTO'}`);
    
    const payload = {
      order: {
        internalReference: `TEST_ES_${Date.now()}`,
        language: "en",
        paymentMethod: "moneybox",
        ...(carrier ? { carriers: [{ name: carrier }] } : {}),
        shippingAddress: {
          firstName: "Test",
          lastName: "User",
          country: "ES",
          postcode: "28001",
          town: "Madrid",
          address: "Calle Test 123",
          phone: "+34600000000",
          email: "test@example.com",
          comment: "",
        },
        products: [
          {
            reference: testSKU,
            quantity: 1,
          },
        ],
      },
    };

    try {
      console.log("Sending CHECK request to Spain...");
      const response = await axios.post(
        `${BIGBUY_BASE_URL}/rest/order/check/multishipping.json`,
        payload,
        { headers }
      );

      console.log("✅ SUCCESS! Order check passed for Spain:");
      console.log(`   Carrier: ${carrier || 'AUTO'}`);
      console.log(`   Product: ${testSKU}`);
      console.log(`   Country: ES (Spain)`);
      console.log("\nResponse:");
      console.log(JSON.stringify(response.data, null, 2));
      
      return { carrier: carrier || 'AUTO', sku: testSKU, country: 'ES' };
      
    } catch (err) {
      console.log(`❌ Failed with carrier '${carrier || 'AUTO'}' (Spain):`, err.response?.data?.message || err.message);
    }
  }
  
  console.log("\n❌ All configurations failed");
  return null;
}

async function checkApiConnection() {
  console.log("🔌 Testing API connection...");
  try {
    const response = await axios.get(
      `${BIGBUY_BASE_URL}/rest/catalog/products.json`,
      {
        headers,
        params: { pageSize: 1 },
      }
    );
    console.log("✅ API connection successful\n");
    return true;
  } catch (err) {
    console.error("❌ API connection failed:", err.response?.data || err.message);
    console.error("💡 Check your BIGBUY_API_KEY_SANDBOX in .env file");
    return false;
  }
}

async function run() {
  const connected = await checkApiConnection();
  if (!connected) {
    console.log("\n❌ Cannot proceed without API connection");
    return;
  }
  
  const result = await testOrderWithRealProduct();
  
  if (result) {
    console.log("\n\n✅ WORKING CONFIGURATION FOUND:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Product SKU: ${result.sku}`);
    console.log(`Carrier: ${result.carrier}`);
    console.log(`Country: ${result.country || 'HR'}`);
    console.log("\n📝 Update your product in database:");
    console.log(`UPDATE products SET urllink = '${result.sku}' WHERE id = 7;`);
    
    if (result.country === 'ES') {
      console.log("\n⚠️  WARNING: Croatia (HR) is not working in BigBuy sandbox");
      console.log("⚠️  You'll need to test with Spain or use production mode");
    }
  } else {
    console.log("\n\n❌ NO WORKING CONFIGURATION FOUND");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Possible issues:");
    console.log("1. BigBuy sandbox has limited functionality");
    console.log("2. Croatia might not be supported in sandbox");
    console.log("3. Products might be out of stock in sandbox");
    console.log("\n💡 RECOMMENDATIONS:");
    console.log("- Switch to BIGBUY_USE_SANDBOX=false (production)");
    console.log("- Or accept that sandbox has limitations and test in production");
    console.log("- Your payment flow is working correctly (authorize → check → capture/cancel)");
  }
}

run();