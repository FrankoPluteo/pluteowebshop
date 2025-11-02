const https = require("https");

https.get("https://api.stripe.com/v1/charges", (res) => {
  console.log("Status code:", res.statusCode);
}).on("error", (e) => {
  console.error("SSL error:", e);
});
