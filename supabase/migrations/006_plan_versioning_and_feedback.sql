-- 006_plan_versioning_and_feedback.sql
-- Lifecycle-spine increment 1: plan versioning + feedback-reminder cadence.
--
-- Idempotent (the dev runner re-applies every file): all changes use
-- IF NOT EXISTS / DROP ... IF EXISTS so re-running is a no-op.

-- ── Plan versioning columns ──────────────────────────────────────────────────
-- A plan version chain: the root plan has parent_plan_id = NULL and
-- version_number = 1; each new version points parent_plan_id at the ROOT and
-- bumps version_number = max(chain) + 1. version_label carries Roberto's
-- human convention (v1, v1.1, v1.2 for tweaks/regenerations; v2 for a brand-new
-- plan). change_reason records why the version was cut. feedback_check_in_id
-- links the version to the check-in (feedback questionnaire) that prompted it.
ALTER TABLE plan ADD COLUMN IF NOT EXISTS parent_plan_id UUID REFERENCES plan(id);
ALTER TABLE plan ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plan ADD COLUMN IF NOT EXISTS version_label TEXT;
ALTER TABLE plan ADD COLUMN IF NOT EXISTS change_reason TEXT;
ALTER TABLE plan ADD COLUMN IF NOT EXISTS feedback_check_in_id UUID REFERENCES check_in(id);

-- Fast lookup of a version chain by its root.
CREATE INDEX IF NOT EXISTS idx_plan_parent_plan_id ON plan(parent_plan_id);

-- ── Notification: allow the 'feedback_requested' trigger ─────────────────────
-- The trigger CHECK is an inline constraint named notification_trigger_check.
-- Drop and re-create it with the new value appended (idempotent across re-runs).
ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_trigger_check;
ALTER TABLE notification ADD CONSTRAINT notification_trigger_check CHECK (trigger IN (
  'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
  'plan_expiring', 'invoice_overdue', 'invoice_paid',
  'task_due_today', 'task_overdue', 'new_message',
  'training_logged', 'milestone_reached',
  'feedback_requested'
));
