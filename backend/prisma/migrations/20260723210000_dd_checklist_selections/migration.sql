-- AlterTable
ALTER TABLE "due_diligence_orders" ADD COLUMN IF NOT EXISTS "checklistSelections" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "checklistSelections" JSONB NOT NULL DEFAULT '{}';
