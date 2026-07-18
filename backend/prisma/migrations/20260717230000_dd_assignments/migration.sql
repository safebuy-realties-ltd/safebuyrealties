-- CreateTable
CREATE TABLE "due_diligence_assignments" (
    "id" TEXT NOT NULL,
    "dueDiligenceOrderId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "scheduleCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reportStorageKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "due_diligence_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "due_diligence_assignments_professionalId_status_idx" ON "due_diligence_assignments"("professionalId", "status");

-- CreateIndex
CREATE INDEX "due_diligence_assignments_dueDiligenceOrderId_idx" ON "due_diligence_assignments"("dueDiligenceOrderId");

-- AddForeignKey
ALTER TABLE "due_diligence_assignments" ADD CONSTRAINT "due_diligence_assignments_dueDiligenceOrderId_fkey" FOREIGN KEY ("dueDiligenceOrderId") REFERENCES "due_diligence_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "due_diligence_assignments" ADD CONSTRAINT "due_diligence_assignments_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
