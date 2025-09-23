const express = require("express");
const cors = require("cors");

const productRoutes = require("./routes/productRoutes");

const app = express();

app.use(cors());

app.use('/images', express.static('public/images'));

app.use("/products", productRoutes);

module.exports = app;