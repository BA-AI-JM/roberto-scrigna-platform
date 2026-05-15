-- Roberto Scrigna Platform: relax training_log.session_type to free-form text
--
-- The base schema constrained session_type to a fixed 7-value enum
-- ('strength', 'hypertrophy', 'cardio', 'hiit', 'flexibility', 'deload',
-- 'other'). Roberto's feedback (May 2026 #10) flagged that this dropdown
-- lacked the activity types he actually uses ("Arti marziali" etc).
--
-- The intake form and SCP categoriser have been unified on the v4.4 spec
-- Appendix D modality taxonomy. This migration removes the CHECK constraint
-- so the training-log form can write the same canonical Italian display
-- names (e.g. "Pesi — Ipertrofia", "BJJ — Sparring", "Corsa — Costante").
--
-- Existing rows with legacy values ('strength', 'cardio', etc.) remain valid
-- and continue to render — the UI falls back to displaying the value itself
-- when no friendly label is found.

DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'training_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%session_type%'
  LOOP
    EXECUTE 'ALTER TABLE training_log DROP CONSTRAINT ' || quote_ident(cname);
  END LOOP;
END$$;
