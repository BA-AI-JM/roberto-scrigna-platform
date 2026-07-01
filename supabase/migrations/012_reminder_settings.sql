-- 012_reminder_settings.sql
-- Build #07: customizable per-client monitoring reminders (coach sets per-client
-- check-in + body-composition reminder cadence). Independent of the #29 stack and #5.
--
-- WHY A NEW TABLE: notification_settings is PER-PARTNER (partner_id UNIQUE, a JSONB
-- of global trigger prefs) — the wrong cardinality for per-client cadence. A clean
-- per-client table keyed by client_id is correct and keeps RLS simple.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate runner.
-- SELF-CONTAINED: depends only on the base schema (001's client + notification
-- tables) — it does NOT depend on the #29 migrations 009/010 (or any 011). The
-- '012' number just sorts it last; apply it any time after 001. Fully idempotent
-- (CREATE ... IF NOT EXISTS / DROP ... IF EXISTS) — re-running is a no-op.
--
-- DEFAULTS preserve today's behaviour: check_in_every_days = 21 matches the
-- hardcoded FEEDBACK_DUE_DAYS the feedback/check-in cron uses now (so existing
-- clients are unchanged); body_comp_every_days = 0 means OFF (body-comp reminders
-- are NET-NEW and opt-in — no surprise emails for existing clients).

-- ── client_reminder_settings (one row per client) ────────────────────────────
CREATE TABLE IF NOT EXISTS client_reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) UNIQUE,
  check_in_every_days INTEGER NOT NULL DEFAULT 21
    CHECK (check_in_every_days BETWEEN 1 AND 90),
  body_comp_every_days INTEGER NOT NULL DEFAULT 0   -- 0 = off (opt-in)
    CHECK (body_comp_every_days BETWEEN 0 AND 90),
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_reminder_settings_client ON client_reminder_settings(client_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE client_reminder_settings ENABLE ROW LEVEL SECURITY;

-- Partner-full for their own clients (mirrors the client-scoped policies, via the
-- client -> partner join). FOR ALL USING also gates partner INSERT/UPDATE.
DROP POLICY IF EXISTS client_reminder_settings_partner_access ON client_reminder_settings;
CREATE POLICY client_reminder_settings_partner_access ON client_reminder_settings
  FOR ALL USING (
    client_id IN (
      SELECT id FROM client
      WHERE partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
    )
  );

-- Client may read their own (defence-in-depth; the cron uses the service role).
DROP POLICY IF EXISTS client_reminder_settings_client_read ON client_reminder_settings;
CREATE POLICY client_reminder_settings_client_read ON client_reminder_settings
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM client WHERE auth_user_id = auth.uid())
  );

-- ── Allow the net-new reminder/feedback notification triggers ────────────────
-- The trigger CHECK is the inline constraint notification_trigger_check; drop and
-- re-create it with the full existing value list. This list carries the UNION of
-- every net-new trigger added by the parallel unmerged migrations —
-- 'body_comp_due' (this #07 migration) AND 'urgent_feedback' (013 / #28) — so that
-- 012 and 013 are ORDER-INDEPENDENT: whichever is applied last, both values survive
-- and neither ADD CONSTRAINT fails against a row the other migration already wrote.
-- (idempotent: DROP IF EXISTS + ADD.)
ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_trigger_check;
ALTER TABLE notification ADD CONSTRAINT notification_trigger_check CHECK (trigger IN (
  'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
  'plan_expiring', 'invoice_overdue', 'invoice_paid',
  'task_due_today', 'task_overdue', 'new_message',
  'training_logged', 'milestone_reached',
  'feedback_requested', 'plan_update_suggested',
  'body_comp_due', 'urgent_feedback'
));

-- ── Verification (read-only; safe to run after apply) ─────────────────────────
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'client_reminder_settings';
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename = 'client_reminder_settings' ORDER BY policyname;
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'notification_trigger_check';
--   → the returned value list MUST include BOTH 'body_comp_due' AND 'urgent_feedback'.
