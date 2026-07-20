-- 018_migration_ledger.sql
-- Durable, idempotent record of repository migrations applied to this database.

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
  ON schema_migrations_applied
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
VALUES
  ('001_initial_schema.sql', NULL, 'backfill-2026-07-20'),
  ('002_client_media_storage.sql', NULL, 'backfill-2026-07-20'),
  ('003_client_media_client_write.sql', NULL, 'backfill-2026-07-20'),
  ('004_training_log_session_type_freeform.sql', NULL, 'backfill-2026-07-20'),
  ('005_training_log_exercise_method_freeform.sql', NULL, 'backfill-2026-07-20'),
  ('006_plan_versioning_and_feedback.sql', NULL, 'backfill-2026-07-20'),
  ('007_placeholder_skipped.sql', NULL, 'backfill-2026-07-20'),
  ('008_plan_update_suggested_trigger.sql', NULL, 'backfill-2026-07-20'),
  ('009_legal_documents.sql', NULL, 'backfill-2026-07-20'),
  ('010_signature_requests.sql', NULL, 'backfill-2026-07-20'),
  ('011_snapshot_edit_audit.sql', NULL, 'backfill-2026-07-20'),
  ('012_reminder_settings.sql', NULL, 'backfill-2026-07-20'),
  ('013_urgent_feedback.sql', NULL, 'backfill-2026-07-20'),
  ('014_session_kcal_override.sql', NULL, 'backfill-2026-07-20'),
  ('015_partner_practice_profile.sql', NULL, 'backfill-2026-07-20'),
  ('016_invoice_number_per_partner.sql', NULL, 'backfill-2026-07-20'),
  ('017_checkin_token_rpc.sql', NULL, 'backfill-2026-07-20')
ON CONFLICT (filename) DO NOTHING;
