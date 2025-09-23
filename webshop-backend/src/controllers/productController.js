// src/controllers/productController.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// --- Existing exports.getAllProducts (keep this as is) ---
exports.getAllProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const search = req.query.search ? req.query.search.toLowerCase() : '';
        const brands = req.query.brands ? req.query.brands.split(',') : [];
        const maxPrice = parseFloat(req.query.maxPrice);
        const gender = req.query.gender ? req.query.gender.toLowerCase() : '';

        const whereClause = {};

        if (search) {
            whereClause.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { brand: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (brands.length > 0) {
            whereClause.brand = { in: brands };
        }
        if (!isNaN(maxPrice)) {
            whereClause.price = { lte: maxPrice };
        }
        if (gender) {
            whereClause.gender = { equals: gender, mode: 'insensitive' };
        }

        const products = await prisma.products.findMany({
            skip: skip,
            take: limit,
            where: whereClause,
        });

        const totalProductsCount = await prisma.products.count({
            where: whereClause,
        });

        const totalPages = Math.ceil(totalProductsCount / limit);

        res.json({
            products: products,
            totalProducts: totalProductsCount,
            totalPages: totalPages,
            currentPage: page,
            limit: limit
        });

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Failed to fetch products", details: error.message });
    }
};

// --- NEW: Function to get a single product by ID ---
exports.getSingleProduct = async (req, res) => {
    try {
        const productId = parseInt(req.params.id); // Parse ID from URL parameter

        if (isNaN(productId)) {
            return res.status(400).json({ error: "Invalid product ID provided." });
        }

        const product = await prisma.products.findUnique({
            where: {
                id: productId,
            },
        });

        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        res.json(product);

    } catch (error) {
        console.error("Error fetching single product:", error);
        res.status(500).json({ error: "Failed to fetch product details", details: error.message });
    }
};


// --- Existing exports.getProductsMetadata (keep this as is) ---
exports.getProductsMetadata = async (req, res) => {
    try {
        const distinctBrands = await prisma.products.findMany({
            distinct: ['brand'],
            select: { brand: true },
            where: {
                brand: { not: null, not: '' }
            },
            orderBy: { brand: 'asc' }
        });
        const brands = distinctBrands.map(item => item.brand);

        const distinctGenders = await prisma.products.findMany({
            distinct: ['gender'],
            select: { gender: true },
            where: {
                gender: { not: null, not: '' }
            },
            orderBy: { gender: 'asc' }
        });
        const genders = distinctGenders.map(item => item.gender);

        const maxPriceResult = await prisma.products.aggregate({
            _max: {
                price: true,
            },
        });
        const overallMaxPrice = maxPriceResult._max.price || 0;

        res.json({
            brands: brands,
            genders: genders,
            maxPrice: overallMaxPrice,
        });

    } catch (error) {
        console.error("Error fetching product metadata:", error);
        res.status(500).json({ error: "Failed to fetch product metadata", details: error.message });
    }
};

// --- Existing exports.createProduct (keep this as is) ---
exports.createProduct = async (req, res) => {
    const {
        name,
        brand,
        description,
        gender,
        image,
        price,
        size,
        attributes
    } = req.body;

    try {
        const newProduct = await prisma.products.create({
            data: {
                name,
                brand,
                description,
                gender,
                image,
                price: parseFloat(price),
                size,
                attributes
            }
        });
        res.json(newProduct);
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ error: "Failed to create product", details: error.message });
    }
};