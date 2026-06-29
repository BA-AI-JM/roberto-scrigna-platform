-- 008_plan_update_suggested_trigger.sql
-- #25 Stage A: allow the 'plan_update_suggested' notification trigger.
--
-- The plan-update heuristic (weight-change → suggest regenerate) emits a
-- COACH-SCOPED notification (client_id = NULL) suggesting the coach regenerate
-- a plan after a client loses ≥10% bodyweight. This adds the new trigger value
-- to the notification.trigger CHECK constraint. PROMPT LAYER ONLY — no plan is
-- ever mutated by this feature; the coach applies it via the existing #24
-- createVersion flow.
--
-- Idempotent (mirrors 006): DROP ... IF EXISTS then re-CREATE the constraint
-- with the full value list (all existing triggers + the new one), so re-running
-- is a no-op.

ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_trigger_check;
ALTER TABLE notification ADD CONSTRAINT notification_trigger_check CHECK (trigger IN (
  'checkin_overdue', 'checkin_completed', 'weight_deviation', 'low_adherence',
  'plan_expiring', 'invoice_overdue', 'invoice_paid',
  'task_due_today', 'task_overdue', 'new_message',
  'training_logged', 'milestone_reached',
  'feedback_requested',
  'plan_update_suggested'
));
