-- MVP transaction lifecycle: INITIATED | IN_PROGRESS | COMPLETED
CREATE TYPE "TransactionStatus_new" AS ENUM ('INITIATED', 'IN_PROGRESS', 'COMPLETED');

ALTER TABLE "Transaction" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Transaction" ALTER COLUMN "status" TYPE "TransactionStatus_new" USING (
  CASE "status"::text
    WHEN 'INITIATED' THEN 'INITIATED'::"TransactionStatus_new"
    WHEN 'DUE_DILIGENCE' THEN 'IN_PROGRESS'::"TransactionStatus_new"
    WHEN 'PAYMENT' THEN 'IN_PROGRESS'::"TransactionStatus_new"
    WHEN 'CLOSED' THEN 'COMPLETED'::"TransactionStatus_new"
    WHEN 'CANCELLED' THEN 'COMPLETED'::"TransactionStatus_new"
    ELSE 'INITIATED'::"TransactionStatus_new"
  END
);

DROP TYPE "TransactionStatus";
ALTER TYPE "TransactionStatus_new" RENAME TO "TransactionStatus";

ALTER TABLE "Transaction" ALTER COLUMN "status" SET DEFAULT 'INITIATED'::"TransactionStatus";
