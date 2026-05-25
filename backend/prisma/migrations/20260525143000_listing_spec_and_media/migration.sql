-- Listing spec fields and listing media (hero/gallery)
ALTER TABLE "Listing" ADD COLUMN "beds" INTEGER,
ADD COLUMN "baths" INTEGER,
ADD COLUMN "landAreaSqm" DECIMAL(10,2),
ADD COLUMN "buildType" TEXT;

CREATE TABLE "ListingMedia" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingMedia_listingId_idx" ON "ListingMedia"("listingId");

ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
