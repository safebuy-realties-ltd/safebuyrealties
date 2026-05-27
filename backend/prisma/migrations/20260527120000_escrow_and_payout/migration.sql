-- CreateTable
CREATE TABLE "escrows" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_FUNDS',
    "heldAmount" DECIMAL(18,2) NOT NULL,
    "releaseConditions" JSONB NOT NULL DEFAULT '[]',
    "conditionsMet" JSONB NOT NULL DEFAULT '[]',
    "heldAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releaseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "escrows_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "platformFee" DECIMAL(18,2) NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gatewayReference" TEXT,
    "initiatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "escrows_transactionId_key" ON "escrows"("transactionId");
CREATE INDEX "payouts_transactionId_idx" ON "payouts"("transactionId");
CREATE INDEX "payouts_sellerId_idx" ON "payouts"("sellerId");
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
