-- Roberto Scrigna Platform: relax training_log.exercise_method to free-form text
--
-- The base CHECK ('heart_rate' | 'met_value' | 'session_estimate' |
-- 'default_estimate') doesn't include 'sport_correction_protocol', which is
-- now used when OCR-extracted HR-zone data is fed into the SCP engine to
-- derive an exercise-energy estimate (see training-log.ts create).
--
-- Pattern matches migration 004: drop the inline CHECK via a DO block so the
-- column accepts the broader set of methods (and stays validated at the Zod
-- layer in the tRPC schema).

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
      AND pg_get_constraintdef(con.oid) ILIKE '%exercise_method%'
  LOOP
    EXECUTE 'ALTER TABLE training_log DROP CONSTRAINT ' || quote_ident(cname);
  END LOOP;
END$$;
