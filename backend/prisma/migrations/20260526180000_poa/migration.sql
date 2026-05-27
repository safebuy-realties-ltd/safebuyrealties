-- CreateTable
CREATE TABLE "power_of_attorney" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "pdfStorageKey" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "qrCodeStorageKey" TEXT NOT NULL,
    "signatureMethod" TEXT NOT NULL,
    "signatureName" TEXT NOT NULL,
    "consentFlags" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "power_of_attorney_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "power_of_attorney_transactionId_key" ON "power_of_attorney"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "power_of_attorney_documentHash_key" ON "power_of_attorney"("documentHash");

-- CreateIndex
CREATE INDEX "power_of_attorney_documentHash_idx" ON "power_of_attorney"("documentHash");

-- CreateIndex
CREATE INDEX "power_of_attorney_buyerId_idx" ON "power_of_attorney"("buyerId");

-- AddForeignKey
ALTER TABLE "power_of_attorney" ADD CONSTRAINT "power_of_attorney_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_of_attorney" ADD CONSTRAINT "power_of_attorney_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_of_attorney" ADD CONSTRAINT "power_of_attorney_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
