-- CreateEnum
CREATE TYPE "PaymentIntent" AS ENUM ('DD_SERVICE', 'PROPERTY_PURCHASE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionStatus" ADD VALUE 'DD_PURCHASED';
ALTER TYPE "TransactionStatus" ADD VALUE 'DD_IN_PROGRESS';
ALTER TYPE "TransactionStatus" ADD VALUE 'DD_COMPLETE';
ALTER TYPE "TransactionStatus" ADD VALUE 'PURCHASE_PENDING';
ALTER TYPE "TransactionStatus" ADD VALUE 'PURCHASE_IN_ESCROW';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "intent" "PaymentIntent" NOT NULL DEFAULT 'DD_SERVICE';

-- CreateTable
CREATE TABLE "due_diligence_orders" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "bundleId" TEXT,
    "itemIds" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "due_diligence_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "due_diligence_orders_transactionId_key" ON "due_diligence_orders"("transactionId");
