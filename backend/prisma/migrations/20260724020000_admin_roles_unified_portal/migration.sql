-- CreateTable
CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_name_key" ON "admin_roles"("name");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "adminRoleId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "admin_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
