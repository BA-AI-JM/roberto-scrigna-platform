-- 013_urgent_feedback.sql
-- Build #28: urgent-feedback + injury-report channel — a SEPARATE channel from
-- the 3-weekly structured feedback (check_in, already ships) and NOT real-time
-- chat. #28 only CAPTURES the submission + NOTIFIES the coach; it MUST NOT
-- auto-regenerate the plan (per Roberto's heuristics — regeneration stays manual).
--
-- MIGRATION NUMBER: 013. 009/010 are #29 (PRs 41/43), 011 is reserved by #5
-- (snapshot-edit), 012 is #07 (PR 48) → 013 is the next unused number.
--
-- WHY A DEDICATED TABLE: the `message` table is freeform (body TEXT) and can't
-- hold the structured injury fields (area/severity/onset/limitations); check_in
-- is the structured 3-weekly feedback. A dedicated table keeps the injury report
-- queryable and statusable.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate
-- runner. Self-contained (depends only on the base schema 001: client, partner,
-- notification). Fully idempotent — re-running is a no-op.

-- ── urgent_feedback (urgent feedback + structured injury reports) ─────────────
CREATE TABLE IF NOT EXISTS urgent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  partner_id UUID NOT NULL REFERENCES partner(id),
  kind TEXT NOT NULL CHECK (kind IN ('urgent_feedback', 'injury_report')),
  message TEXT NOT NULL,
  injury_area TEXT,         -- injury_report only
  injury_severity TEXT,     -- injury_report only
  injury_onset DATE,        -- injury_report only
  limitations TEXT,         -- injury_report only
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_urgent_feedback_client ON urgent_feedback(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_urgent_feedback_partner ON urgent_feedback(partner_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE urgent_feedback ENABLE ROW LEVEL SECURITY;

-- Client: insert + read their OWN submissions.
DROP POLICY IF EXISTS urgent_feedback_client_insert ON urgent_feedback;
CREATE POLICY urgent_feedback_client_insert ON urgent_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (SELECT id FROM client WHERE auth_user_id = auth.uid())
    -- the stamped partner_id must be the client's REAL partner (no cross-tenant inject)
    AND partner_id IN (SELECT partner_id FROM client WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS urgent_feedback_client_read ON urgent_feedback;
CREATE POLICY urgent_feedback_client_read ON urgent_feedback
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM client WHERE auth_user_id = auth.uid())
  );

-- Partner: read + update (status) their OWN clients' submissions.
DROP POLICY IF EXISTS urgent_feedback_partner_read ON urgent_feedback;
CREATE POLICY urgent_feedback_partner_read ON urgent_feedback
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS urgent_feedback_partner_update ON urgent_feedback;
CREATE POLICY urgent_feedback_partner_update ON urgent_feedback
  FOR UPDATE TO authenticated
  USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- ── Allow the 'urgent_feedback' notification trigger (the coach alert) ────────
-- The coach is notified via the existing notification table (priority 'urgent'),
-- so the #2 per-client feed surfaces it. Add the new trigger value to the CHECK.
ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_trigger_check;
ALTER TABLE notification ADD CONSTRAINT notification_trigger_check CHECK (trigger IN (
  'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
  'plan_expiring', 'invoice_overdue', 'invoice_paid',
  'task_due_today', 'task_overdue', 'new_message',
  'training_logged', 'milestone_reached',
  'feedback_requested', 'plan_update_suggested',
  'urgent_feedback'
));

-- ── Verification (read-only; safe to run after apply) ─────────────────────────
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'urgent_feedback';
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename = 'urgent_feedback' ORDER BY policyname;
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'notification_trigger_check';
