-- ============================================================================
-- PROD PRE-FLIGHT — READ-ONLY. Paste into Supabase SQL editor and send output.
-- Reports which migration-owned objects exist, plus data-integrity checks.
-- Touches nothing. 2026-07-20, branch polish/audit-arc-2026-07.
-- ============================================================================

WITH checks(migration, kind, name, present) AS (
  VALUES
  ('001', 'table',  'client',                 to_regclass('public.client') IS NOT NULL),
  ('001', 'table',  'plan',                   to_regclass('public.plan') IS NOT NULL),
  ('001', 'table',  'check_in',               to_regclass('public.check_in') IS NOT NULL),
  ('001', 'table',  'check_in_token',         to_regclass('public.check_in_token') IS NOT NULL),
  ('001', 'table',  'invoice',                to_regclass('public.invoice') IS NOT NULL),
  ('006', 'column', 'plan.parent_plan_id',    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plan' AND column_name='parent_plan_id')),
  ('006', 'column', 'plan.version_number',    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plan' AND column_name='version_number')),
  ('009', 'table',  'legal_document',         to_regclass('public.legal_document') IS NOT NULL),
  ('010', 'table',  'signature_request',      to_regclass('public.signature_request') IS NOT NULL),
  ('011', 'table',  'snapshot_edit_audit',    to_regclass('public.snapshot_edit_audit') IS NOT NULL),
  ('012', 'table',  'client_reminder_settings', to_regclass('public.client_reminder_settings') IS NOT NULL),
  ('013', 'table',  'urgent_feedback',        to_regclass('public.urgent_feedback') IS NOT NULL),
  ('014', 'column', 'training_log.kcal_override', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_log' AND column_name='kcal_override')),
  ('015', 'table',  'partner_practice_profile', to_regclass('public.partner_practice_profile') IS NOT NULL),
  ('016', 'index',  'idx_invoice_number_partner', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoice_number_partner')),
  ('017', 'fn',     'checkin_validate_token', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='checkin_validate_token')),
  ('017', 'fn',     'checkin_submit_token',   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='checkin_submit_token')),
  ('017', 'column', 'check_in.token_expires_at', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='check_in' AND column_name='token_expires_at')),
  ('018', 'table',  'schema_migrations_applied', to_regclass('public.schema_migrations_applied') IS NOT NULL),
  ('019', 'table',  'delivery_outbox',        to_regclass('public.delivery_outbox') IS NOT NULL),
  ('019', 'column', 'plan.first_viewed_at',   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plan' AND column_name='first_viewed_at')),
  ('019', 'fn',     'approve_plan_txn',       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_plan_txn')),
  ('019', 'index',  'uniq_plan_one_active_per_client', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_plan_one_active_per_client')),
  ('020', 'fn',     'intake_create_client_with_snapshot', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='intake_create_client_with_snapshot')),
  ('020', 'table',  'intake_idempotency',     to_regclass('public.intake_idempotency') IS NOT NULL),
  ('021', 'table',  'consent_record',         to_regclass('public.consent_record') IS NOT NULL),
  ('021', 'fn',     'gdpr_export_client',     EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='gdpr_export_client')),
  ('021', 'column', 'client.codice_fiscale',  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='client' AND column_name='codice_fiscale'))
)
SELECT migration, kind, name,
       CASE WHEN present THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM checks
UNION ALL
SELECT '—', 'data', 'max_active_plans_per_client (BLOCKER if >= 2; 0 or 1 is fine)',
       COALESCE((SELECT max(cnt)::text FROM (SELECT count(*) AS cnt FROM plan WHERE status='active' AND deleted_at IS NULL GROUP BY client_id) t), '0')
UNION ALL
SELECT '—', 'data', 'total clients', (SELECT count(*)::text FROM client)
UNION ALL
SELECT '—', 'data', 'total plans (by status)', (SELECT COALESCE(string_agg(status || ':' || cnt, ', '), 'none') FROM (SELECT status, count(*) AS cnt FROM plan GROUP BY status) s)
ORDER BY 1, 3;
