-- apply-pending.sql
-- Generated 2026-07-21T17:17:56.341Z; paste the entire bundle into Supabase SQL Editor.
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

-- 023_client_cooperation.sql
DO $migration_guard_0$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations_applied
    WHERE filename = '023_client_cooperation.sql'
  ) THEN
    EXECUTE $migration_statement_0_0$
-- 023_client_cooperation.sql
-- C1 (#2, Roberto's ruling 2026-07-21): cooperation types replace the
-- lifecycle-only status as the practice-truth about the relationship.
--   abbonamento  — recurring (yearly or period), optional date window
--   consulenza   — pay-per-visit, optional visit count, usually no window
--   fight_camp   — its OWN category: subscription-like but date-bounded
-- plus a free/no-cost flag (he works with some clients gratis).
-- ADDITIVE: existing status (active/paused/archived) remains the lifecycle;
-- engagement state derives from the dates at read time.

ALTER TABLE client ADD COLUMN IF NOT EXISTS cooperation_type TEXT
  CHECK (cooperation_type IN ('abbonamento', 'consulenza', 'fight_camp'));
$migration_statement_0_0$;
    EXECUTE $migration_statement_0_1$
ALTER TABLE client ADD COLUMN IF NOT EXISTS engagement_start DATE;
$migration_statement_0_1$;
    EXECUTE $migration_statement_0_2$
ALTER TABLE client ADD COLUMN IF NOT EXISTS engagement_end DATE;
$migration_statement_0_2$;
    EXECUTE $migration_statement_0_3$
ALTER TABLE client ADD COLUMN IF NOT EXISTS visit_count INTEGER
  CHECK (visit_count IS NULL OR visit_count >= 0);
$migration_statement_0_3$;
    EXECUTE $migration_statement_0_4$
ALTER TABLE client ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;
$migration_statement_0_4$;
    INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
    VALUES ('023_client_cooperation.sql', 'ac91fbd52b05316b2ffb27cd19f5a91de6c648039630987cfc749efdd81f758d', 'migration-runner');
  END IF;
END
$migration_guard_0$;
