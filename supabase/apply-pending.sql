-- apply-pending.sql
-- Generated 2026-07-21T15:32:20.547Z; paste the entire bundle into Supabase SQL Editor.
-- Each migration is atomic and skipped when its filename is already ledgered.

-- Bootstrap only: migration 018 remains the source of record and performs backfill.
CREATE TABLE IF NOT EXISTS schema_migrations_applied (
  filename TEXT PRIMARY KEY,
  checksum TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL
);
ALTER TABLE schema_migrations_applied ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schema_migrations_applied_service_role_only
  ON schema_migrations_applied;
CREATE POLICY schema_migrations_applied_service_role_only
  ON schema_migrations_applied FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 022_practice_codice_fiscale.sql
DO $migration_guard_0$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '022_practice_codice_fiscale.sql'
  ) THEN
    EXECUTE $migration_statement_0_0$
-- 022_practice_codice_fiscale.sql
-- A6 (#1): the practitioner's own codice fiscale on the practice profile —
-- rendered in the lettera di incarico professional line ({{codice_fiscale}}).
ALTER TABLE partner_practice_profile ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
$migration_statement_0_0$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('022_practice_codice_fiscale.sql', '909f89e688a1b155ac222f94497d7bd482a09b6a7fe6cda02518f51fc31450af', 'migration-runner');
  END IF;
END
$migration_guard_0$;
