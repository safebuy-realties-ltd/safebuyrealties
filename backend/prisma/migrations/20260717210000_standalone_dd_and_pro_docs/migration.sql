-- Professional onboarding document keys
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "licenseDocumentKey" TEXT;
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "idDocumentKey" TEXT;

-- External (off-platform) property subjects
CREATE TABLE IF NOT EXISTS "external_properties" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "address" TEXT NOT NULL,
    "lga" TEXT,
    "state" TEXT NOT NULL,
    "propertyType" TEXT,
    "approxSize" TEXT,
    "titleRef" TEXT,
    "sellerName" TEXT,
    "sellerContact" TEXT,
    "notes" TEXT,
    "documentKeys" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_properties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "external_properties_createdById_idx" ON "external_properties"("createdById");

ALTER TABLE "external_properties" DROP CONSTRAINT IF EXISTS "external_properties_createdById_fkey";
ALTER TABLE "external_properties" ADD CONSTRAINT "external_properties_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Transaction: optional listing + source for standalone DD
ALTER TABLE "Transaction" ALTER COLUMN "listingId" DROP NOT NULL;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'LISTING';
CREATE INDEX IF NOT EXISTS "Transaction_buyerId_idx" ON "Transaction"("buyerId");
CREATE INDEX IF NOT EXISTS "Transaction_listingId_idx" ON "Transaction"("listingId");

-- ServiceRequest: optional listing + external property + source
ALTER TABLE "service_requests" ALTER COLUMN "listingId" DROP NOT NULL;
ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "externalPropertyId" TEXT;
ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'LISTING';
CREATE INDEX IF NOT EXISTS "service_requests_externalPropertyId_idx" ON "service_requests"("externalPropertyId");

ALTER TABLE "service_requests" DROP CONSTRAINT IF EXISTS "service_requests_externalPropertyId_fkey";
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_externalPropertyId_fkey"
  FOREIGN KEY ("externalPropertyId") REFERENCES "external_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DueDiligenceOrder: standalone fields + relations
ALTER TABLE "due_diligence_orders" ALTER COLUMN "transactionId" DROP NOT NULL;
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "listingId" TEXT;
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "externalPropertyId" TEXT;
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "caseId" TEXT;
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'LISTING';
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "verdict" TEXT;
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "reportStorageKeys" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "staffNotes" TEXT;
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "due_diligence_orders_caseId_key" ON "due_diligence_orders"("caseId");
CREATE INDEX IF NOT EXISTS "due_diligence_orders_buyerId_idx" ON "due_diligence_orders"("buyerId");
CREATE INDEX IF NOT EXISTS "due_diligence_orders_status_idx" ON "due_diligence_orders"("status");
CREATE INDEX IF NOT EXISTS "due_diligence_orders_externalPropertyId_idx" ON "due_diligence_orders"("externalPropertyId");

ALTER TABLE "due_diligence_orders" DROP CONSTRAINT IF EXISTS "due_diligence_orders_transactionId_fkey";
ALTER TABLE "due_diligence_orders" ADD CONSTRAINT "due_diligence_orders_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "due_diligence_orders" DROP CONSTRAINT IF EXISTS "due_diligence_orders_buyerId_fkey";
ALTER TABLE "due_diligence_orders" ADD CONSTRAINT "due_diligence_orders_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "due_diligence_orders" DROP CONSTRAINT IF EXISTS "due_diligence_orders_listingId_fkey";
ALTER TABLE "due_diligence_orders" ADD CONSTRAINT "due_diligence_orders_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "due_diligence_orders" DROP CONSTRAINT IF EXISTS "due_diligence_orders_externalPropertyId_fkey";
ALTER TABLE "due_diligence_orders" ADD CONSTRAINT "due_diligence_orders_externalPropertyId_fkey"
  FOREIGN KEY ("externalPropertyId") REFERENCES "external_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
