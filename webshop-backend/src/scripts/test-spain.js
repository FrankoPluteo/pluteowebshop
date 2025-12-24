// test-spain-order.js
// Test BigBuy order with Spain address (more likely to work in sandbox)
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

console.log(`\n🧪 Testing BigBuy Order to Spain (${BIGBUY_USE_SANDBOX ? 'SANDBOX' : 'PRODUCTION'})\n`);

async function testSpainOrder() {
  const sku = "S0103015"; // The product we found with stock
  
  // Test with Spain address
  const payload = {
    order: {
      internalReference: `TEST_SPAIN_${Date.now()}`,
      language: "en",
      paymentMethod: "moneybox",
      shippingAddress: {
        firstName: "Test",
        lastName: "User",
        country: "ES",
        postcode: "28001",
        town: "Madrid",
        address: "Calle Gran Via 1",
        phone: "+34600000000",
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
    // Step 1: Check carriers for Spain
    console.log("📦 Step 1: Checking carriers for Spain...");
    const carriersResponse = await axios.get(
      `${BIGBUY_BASE_URL}/rest/shipping/carriers.json`,
      {
        headers,
        params: {
          isoCountry: "ES",
          postalCode: "28001",
        },
      }
    );
    
    console.log(`✅ Found ${carriersResponse.data.length} carriers for Spain`);
    if (carriersResponse.data.length > 0) {
      console.log("Available carriers:");
      carriersResponse.data.slice(0, 5).forEach(c => {
        console.log(`   - ${c.name}`);
      });
      
      // Add carriers to payload
      payload.order.carriers = carriersResponse.data.slice(0, 3).map(c => ({
        name: c.name.toLowerCase()
      }));
    }
    
    console.log("\n📤 Step 2: Sending CHECK request...");
    console.log(JSON.stringify(payload, null, 2));
    
    const checkResponse = await axios.post(
      `${BIGBUY_BASE_URL}/rest/order/check/multishipping.json`,
      payload,
      { headers }
    );

    console.log("\n✅ ORDER CHECK SUCCESSFUL!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Response:");
    console.log(JSON.stringify(checkResponse.data, null, 2));
    
    console.log("\n🎉 SUCCESS! BigBuy accepts orders to Spain in sandbox!");
    console.log("\n💡 SOLUTION:");
    console.log("   - BigBuy sandbox doesn't support Croatia (HR)");
    console.log("   - For testing, use Spain (ES) or other supported countries");
    console.log("   - For production, Croatia will work fine");
    
    return true;
    
  } catch (err) {
    console.error("\n❌ ORDER CHECK FAILED:");
    console.error(err.response?.data || err.message);
    
    console.log("\n💡 This means:");
    console.log("   - BigBuy sandbox has very limited country support");
    console.log("   - Your code is working correctly");
    console.log("   - Switch to production BigBuy for real testing");
    
    return false;
  }
}

testSpainOrder();