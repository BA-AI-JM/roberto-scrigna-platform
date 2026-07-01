-- 014_session_kcal_override.sql
-- #10 (DISPLAY-ONLY slice): a coach-entered manual per-session expenditure kcal
-- override for unusual activities.
--
-- HARD BOUNDARY — this is NOT plan-moving: plan generation sources session
-- expenditure from the client_snapshot intake (skinfold_data._intake.training_sessions,
-- read by plan.ts intakeTrainingSessions()), and NEVER from training_log. Adding a
-- column to training_log therefore CANNOT change any generated plan's calories. It
-- is read only by the coach/portal display + analytics surfaces.
--
-- MIGRATION NUMBER: 014. 009/010 = #29, 011 = #5, 012 = #07, 013 = #28 → 014 next free.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate runner.
-- Self-contained (depends only on the base training_log table from 001). Idempotent
-- (ADD COLUMN IF NOT EXISTS) — re-running is a no-op.

ALTER TABLE training_log ADD COLUMN IF NOT EXISTS kcal_override NUMERIC;

COMMENT ON COLUMN training_log.kcal_override IS
  'Coach-entered manual per-session expenditure (kcal). DISPLAY-ONLY — not read by plan generation.';

-- ── Verification (read-only; safe to run after apply) ─────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'training_log' AND column_name = 'kcal_override';
