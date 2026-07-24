-- CreateTable
CREATE TABLE "permission_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dd_schedule_configs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedProfessionalTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dd_schedule_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dd_checklist_item_configs" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dd_checklist_item_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permission_grants_userId_idx" ON "permission_grants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "permission_grants_userId_permission_key" ON "permission_grants"("userId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "dd_schedule_configs_code_key" ON "dd_schedule_configs"("code");

-- CreateIndex
CREATE INDEX "dd_checklist_item_configs_scheduleId_idx" ON "dd_checklist_item_configs"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "dd_checklist_item_configs_scheduleId_code_key" ON "dd_checklist_item_configs"("scheduleId", "code");

-- AddForeignKey
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dd_checklist_item_configs" ADD CONSTRAINT "dd_checklist_item_configs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "dd_schedule_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
