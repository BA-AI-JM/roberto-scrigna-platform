-- Migration 007 — INTENTIONALLY SKIPPED (placeholder, no-op)
--
-- The hand-numbered migration sequence jumps 006 → 008; there is no functional
-- migration 007. This file exists only so the sequence reads contiguously and a
-- future reader (or James applying migrations via the Supabase SQL Editor) is not
-- left wondering whether an 007 was lost. It applies NOTHING.
--
-- Numbering history: 006_plan_versioning_and_feedback.sql is followed directly by
-- 008_plan_update_suggested_trigger.sql. The 007 slot was skipped during
-- development and never used. No schema object depends on a "007".
--
-- Safe to apply (no-op) or to leave unapplied — it changes nothing either way.

DO $$
BEGIN
  -- no-op: documentation placeholder for the skipped 007 slot
  NULL;
END $$;
