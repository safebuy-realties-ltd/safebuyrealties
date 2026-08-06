-- E9-S1, the financial governance foundation.
--
-- Additive only, first pass. Three new tables and three new nullable columns. Nothing is dropped,
-- nothing is retyped, and no column any deployed code reads changes shape. There is no seed data:
-- the chart of accounts is E9-S3 and it carries open questions to Finance that must be answered
-- before a single rate or category is written down.
--
-- Provenance of the requirements encoded here, pinned by hash because both documents are live:
--   SBR-FIN-DEV-SPEC-20260803-V1.5
--     sha256 49978541698407936fce29e489070dc22fd7fd76e22293084ab3e816f6a22f75
--   SafeBuy Realties ID Standard.docx
--     sha256 42c78808dd768a93b97b82356918a321ab800d89fd80084f157e6fe5f7ca80c0
--
-- Approved for implementation, not for production activation, per FinGov section 14.2. Everything
-- built on these tables ships behind the `financial_governance` flag, which defaults off.
--
-- Locking. The two CREATE TABLE statements take no lock on anything that exists. The ALTER TABLE
-- takes ACCESS EXCLUSIVE on `audit_logs` for the length of a catalog update and no longer: the
-- columns are nullable with no default, so PostgreSQL does not rewrite the table. The one way that
-- becomes a production stall is the lock queueing behind a long transaction already on the table,
-- so the statement below refuses to queue rather than blocking readers behind it. If it times out,
-- rerun the migration; it has done nothing partial by then.
SET lock_timeout = '5s';

-- CreateTable
--
-- Every SBR identifier the platform has issued, and which version of the identification standard
-- issued it. FinGov section 8.1 requires every financial record to carry its applicable SBR IDs,
-- which is only auditable if there is one place that says what each identifier means and where its
-- coding came from.
--
-- `entityType` is TEXT and not an enum on purpose. The ID Standard and FinGov section 5 disagree on
-- the closed set of identifier kinds, and five of those conflicts are open with Digital Records. An
-- enum would freeze one reading of a disputed document into the database and make the answer a
-- migration rather than a row.
--
-- `codingStandard` defaults to a legacy marker because every identifier issued before this table
-- existed was coded against whatever `sbr-id.service.ts` did at the time, which is not what the ID
-- Standard requires. Backfilled rows are therefore honestly labelled as legacy rather than silently
-- claiming compliance, and the register mapping that fixes it is E9-S2.
--
-- A reissued identifier is a new row plus a pointer, never an edit, which is FinGov section 8.2's
-- correction rule applied to identity.
CREATE TABLE "id_register" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityTable" TEXT,
    "entityId" TEXT,
    "codingStandard" TEXT NOT NULL DEFAULT 'LEGACY_PRE_E9',
    "sourceDocument" TEXT,
    "sourceDocumentSha" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "supersededById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "supersededReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "id_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
--
-- The six main codes of FinGov section 3: 1 property listings commission, 2 due diligence, 3
-- escrow, 4 professional commission, 5 operations, 6 central VAT. The rows are not written here.
--
-- `isLiability` and `ringFenced` are separate columns because they are separate claims. Escrow
-- principal is a client-funds liability and never revenue (sections 1.3 and 11.3), and it is also
-- held apart from operating money (section 14.2). A chart of accounts that collapsed the two would
-- let a future account be ring-fenced and counted as income at the same time.
CREATE TABLE "main_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isLiability" BOOLEAN NOT NULL DEFAULT false,
    "ringFenced" BOOLEAN NOT NULL DEFAULT false,
    "allowsDynamicSubledgers" BOOLEAN NOT NULL DEFAULT false,
    "sourceDocument" TEXT,
    "sourceDocumentSha" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "main_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
--
-- Sub-codes under a main code. Two kinds live here and the `dynamic` column is what separates them.
-- The declared ones are fixed by the specification: 11 buyer and 12 seller under main 1, and 21 to
-- 26 under main 2. The dynamic ones are minted per subject, `3-NNNNNN` for an escrow and
-- `4-NNNNNN` for a professional, and those carry `ownerType` and `ownerId` saying whose they are.
--
-- `code` is unique across the whole table rather than per main account, because the specification's
-- own numbering makes the main code the leading character of every sub-code. If Digital Records
-- ever answers that a sub-code may be reused under two mains, that is a deliberate migration and
-- not something a duplicate row should be able to introduce quietly in the meantime.
--
-- No VAT column. FinGov section 4 and Appendix C both assume a withholding that no instrument the
-- seller signs currently authorises, and that question is open with Finance and counsel. Encoding a
-- rate now would make an unanswered question look settled.
CREATE TABLE "account_subledgers" (
    "id" TEXT NOT NULL,
    "mainAccountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dynamic" BOOLEAN NOT NULL DEFAULT false,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "sourceDocument" TEXT,
    "sourceDocumentSha" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_subledgers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "id_register_identifier_key" ON "id_register"("identifier");

-- CreateIndex
CREATE INDEX "id_register_entityTable_entityId_idx" ON "id_register"("entityTable", "entityId");

-- CreateIndex
CREATE INDEX "id_register_entityType_idx" ON "id_register"("entityType");

-- CreateIndex
CREATE INDEX "id_register_codingStandard_idx" ON "id_register"("codingStandard");

-- CreateIndex
CREATE UNIQUE INDEX "main_accounts_code_key" ON "main_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "account_subledgers_code_key" ON "account_subledgers"("code");

-- CreateIndex
CREATE INDEX "account_subledgers_mainAccountId_idx" ON "account_subledgers"("mainAccountId");

-- CreateIndex
CREATE INDEX "account_subledgers_ownerType_ownerId_idx" ON "account_subledgers"("ownerType", "ownerId");

-- AddForeignKey
ALTER TABLE "id_register" ADD CONSTRAINT "id_register_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "id_register"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_subledgers" ADD CONSTRAINT "account_subledgers_mainAccountId_fkey" FOREIGN KEY ("mainAccountId") REFERENCES "main_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
--
-- Three nullable columns on the existing audit table, which is the only change here to something
-- already deployed. Nullable and defaultless, so this is a catalog update and not a rewrite, and
-- every row written before this migration reads back exactly as it did.
--
--   reason     why the action was taken. FinGov section 8.2 makes a correction a reversal plus a
--              replacement rather than an edit, and a reversal that does not say why it happened is
--              not an audit trail, it is a second mystery.
--   requestId  ties together every row one request wrote, so a multi-table financial operation can
--              be read back as the single thing it was.
--   source     what wrote the row: the API, a scheduled job, an operator console, a migration.
ALTER TABLE "audit_logs" ADD COLUMN "reason" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "requestId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "source" TEXT;
