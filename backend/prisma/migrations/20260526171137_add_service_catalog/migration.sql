-- CreateTable
CREATE TABLE "service_catalog_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "basePrice" DECIMAL(18,2) NOT NULL DEFAULT 150000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_bundles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "basePrice" DECIMAL(18,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_items" (
    "bundleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "bundle_items_pkey" PRIMARY KEY ("bundleId","itemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_catalog_items_code_key" ON "service_catalog_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "service_bundles_code_key" ON "service_bundles"("code");

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "service_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "service_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
