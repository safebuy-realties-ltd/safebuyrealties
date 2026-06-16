-- Milestone 1 review: SBR IDs, isPublished, guest service requests, activation tokens

ALTER TABLE "Listing" ADD COLUMN "propertyId" TEXT;
ALTER TABLE "Listing" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN "propertyType" TEXT;

CREATE UNIQUE INDEX "Listing_propertyId_key" ON "Listing"("propertyId");

UPDATE "Listing" SET "isPublished" = true WHERE "status" = 'LIVE';

ALTER TABLE "User" ADD COLUMN "publicId" TEXT;
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

ALTER TABLE "Transaction" ADD COLUMN "caseId" TEXT;
CREATE UNIQUE INDEX "Transaction_caseId_key" ON "Transaction"("caseId");

ALTER TABLE "Payment" ADD COLUMN "transactionPublicId" TEXT;
CREATE UNIQUE INDEX "Payment_transactionPublicId_key" ON "Payment"("transactionPublicId");

ALTER TABLE "due_diligence_orders" ADD COLUMN "serviceId" TEXT;
CREATE UNIQUE INDEX "due_diligence_orders_serviceId_key" ON "due_diligence_orders"("serviceId");

ALTER TABLE "PlatformConfig" ADD COLUMN "inspectionFee" DECIMAL(18,2) NOT NULL DEFAULT 50000;

CREATE TABLE "id_sequences" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "id_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "id_sequences_prefix_dateKey_key" ON "id_sequences"("prefix", "dateKey");

CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "bundleId" TEXT,
    "itemIds" JSONB NOT NULL DEFAULT '[]',
    "includeInspection" BOOLEAN NOT NULL DEFAULT false,
    "inspectionFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "caseId" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_requests_serviceId_key" ON "service_requests"("serviceId");
CREATE UNIQUE INDEX "service_requests_caseId_key" ON "service_requests"("caseId");
CREATE UNIQUE INDEX "service_requests_transactionId_key" ON "service_requests"("transactionId");
CREATE INDEX "service_requests_listingId_idx" ON "service_requests"("listingId");
CREATE INDEX "service_requests_guestEmail_idx" ON "service_requests"("guestEmail");

ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "account_activation_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_activation_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_activation_tokens_token_key" ON "account_activation_tokens"("token");
CREATE INDEX "account_activation_tokens_userId_idx" ON "account_activation_tokens"("userId");

ALTER TABLE "account_activation_tokens" ADD CONSTRAINT "account_activation_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
