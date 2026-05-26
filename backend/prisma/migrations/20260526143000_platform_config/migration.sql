-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "vatRate" DECIMAL(5,4) NOT NULL DEFAULT 0.075,
    "maxUploadMb" INTEGER NOT NULL DEFAULT 15,
    "paystackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "flutterwaveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);
