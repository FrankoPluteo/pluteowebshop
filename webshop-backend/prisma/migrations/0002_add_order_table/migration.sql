-- Only create the Order table; products already exists
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
