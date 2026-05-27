-- CreateTable
CREATE TABLE "saved_properties" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_slots" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "professionalId" TEXT,
    "requestedById" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_properties_buyerId_idx" ON "saved_properties"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_properties_buyerId_listingId_key" ON "saved_properties"("buyerId", "listingId");

-- CreateIndex
CREATE INDEX "inspection_slots_listingId_idx" ON "inspection_slots"("listingId");

-- CreateIndex
CREATE INDEX "inspection_slots_requestedById_idx" ON "inspection_slots"("requestedById");

-- AddForeignKey
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_slots" ADD CONSTRAINT "inspection_slots_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_slots" ADD CONSTRAINT "inspection_slots_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_slots" ADD CONSTRAINT "inspection_slots_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
