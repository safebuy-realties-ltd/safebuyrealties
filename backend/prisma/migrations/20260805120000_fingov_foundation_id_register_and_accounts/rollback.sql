-- Rollback for 20260805120000_fingov_foundation_id_register_and_accounts.
--
-- Prisma has no down-migration, so the reversal is written by hand and rehearsed against a scratch
-- database before the forward migration is proposed. This file is not read by `prisma migrate
-- deploy`; it is run with psql by whoever needs it.
--
-- This is safe to run for exactly as long as nothing has been written to the three tables. The
-- forward migration seeds nothing, and E9-S1 ships no code that writes to them, so at the moment
-- this pair is merged the reversal loses no data at all. Once E9-S2 begins populating `id_register`
-- that stops being true, and the reversal below stops being a rollback and becomes a deletion. Read
-- the counts first; they are printed for that reason and not for tidiness.
--
-- The dropped `audit_logs` columns are the one place data could be lost even now, if a later story
-- has started writing them. Same rule: read the count, then decide.

SET lock_timeout = '5s';

BEGIN;

\echo 'Rows that would be destroyed by this rollback:'
SELECT 'id_register' AS "table", count(*) FROM "id_register"
UNION ALL SELECT 'account_subledgers', count(*) FROM "account_subledgers"
UNION ALL SELECT 'main_accounts', count(*) FROM "main_accounts"
UNION ALL SELECT 'audit_logs rows with any new column set', count(*) FROM "audit_logs"
  WHERE "reason" IS NOT NULL OR "requestId" IS NOT NULL OR "source" IS NOT NULL;

-- Children before parents: account_subledgers references main_accounts, and id_register references
-- itself, so its self-referencing constraint goes with the table.
DROP TABLE IF EXISTS "account_subledgers";
DROP TABLE IF EXISTS "main_accounts";
DROP TABLE IF EXISTS "id_register";

ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "reason";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "requestId";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "source";

-- The migration's own row, so a later `prisma migrate deploy` reapplies the forward migration
-- rather than believing it is already in place.
DELETE FROM "_prisma_migrations"
  WHERE "migration_name" = '20260805120000_fingov_foundation_id_register_and_accounts';

COMMIT;
