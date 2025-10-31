-- Migration for existing products table (do NOT drop it)
-- Just mark that this schema is now managed by Prisma

-- Optional: You can include the products table creation if you want
-- but make sure it matches the existing schema exactly to avoid conflicts

-- New orders table
CREATE TABLE "Order" (
    id SERIAL PRIMARY KEY,
    "stripeSessionId" TEXT UNIQUE NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "shippingAddress" JSON NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    currency TEXT NOT NULL,
    items JSON NOT NULL,
    "paymentStatus" TEXT DEFAULT 'pending',
    "dropshipperStatus" TEXT DEFAULT 'not_sent',
    "createdAt" TIMESTAMP DEFAULT now(),
    "updatedAt" TIMESTAMP DEFAULT now()
);
