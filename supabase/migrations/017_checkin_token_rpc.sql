-- 017_checkin_token_rpc.sql
-- T1.1 (register G1+G6): the public check-in journey could never work — validateToken/
-- submitCheckin are publicProcedures whose anon Supabase client is blocked by the
-- partner-scoped RLS on check_in (runtime-proven 2026-07-19: valid pending token →
-- {valid:false}). The previous-weight context reads suffered the same block, silently
-- nulling the deviation math. Fix: a narrow SECURITY DEFINER surface, granted to anon,
-- that (a) validates a token and returns the server-side context the router needs, and
-- (b) consumes the token atomically with the full submission payload. Deviation/summary
-- stay computed in TypeScript (domain-logic freeze: no clinical logic moves into SQL).
-- No broad anon table policy is added.
-- Also G6: expiry on the token actually consumed (email promises 7 days; the old
-- expires_at lived on the unused check_in_token table).
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout.

ALTER TABLE check_in ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

UPDATE check_in SET token_expires_at = now() + interval '7 days'
WHERE status = 'pending' AND token_expires_at IS NULL;

-- ── validate: read-only; returns router context, never crosses the wire raw ──
-- (Called server-side by tRPC; the router decides what the browser sees.)
DROP FUNCTION IF EXISTS checkin_validate_token(UUID);
CREATE OR REPLACE FUNCTION checkin_validate_token(p_token UUID)
RETURNS TABLE (
  checkin_id UUID,
  client_id UUID,
  partner_id UUID,
  client_first_name TEXT,
  due_date DATE,
  prev_weight_kg NUMERIC,
  is_valid BOOLEAN,
  invalid_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  prev NUMERIC;
BEGIN
  SELECT ci.id, ci.client_id AS cid, ci.partner_id AS pid, ci.status,
         ci.due_date AS ci_due, ci.token_expires_at,
         split_part(c.full_name, ' ', 1) AS first_name
    INTO r
    FROM check_in ci
    JOIN client c ON c.id = ci.client_id
   WHERE ci.token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::DATE,
                        NULL::NUMERIC, FALSE, 'not_found'::TEXT;
    RETURN;
  END IF;

  IF r.status <> 'pending' THEN
    RETURN QUERY SELECT r.id, r.cid, r.pid, r.first_name, r.ci_due,
                        NULL::NUMERIC, FALSE, 'already_completed'::TEXT;
    RETURN;
  END IF;

  IF r.token_expires_at IS NOT NULL AND r.token_expires_at < now() THEN
    RETURN QUERY SELECT r.id, r.cid, r.pid, r.first_name, r.ci_due,
                        NULL::NUMERIC, FALSE, 'expired'::TEXT;
    RETURN;
  END IF;

  -- Previous weight for the TS deviation math: last completed check-in, else latest snapshot.
  SELECT ci2.weight_kg INTO prev
    FROM check_in ci2
   WHERE ci2.client_id = r.cid AND ci2.status = 'completed' AND ci2.weight_kg IS NOT NULL
   ORDER BY ci2.completed_at DESC NULLS LAST
   LIMIT 1;

  IF prev IS NULL THEN
    SELECT cs.weight_kg INTO prev
      FROM client_snapshot cs
     WHERE cs.client_id = r.cid AND cs.weight_kg IS NOT NULL
     ORDER BY cs.taken_at DESC
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT r.id, r.cid, r.pid, r.first_name, r.ci_due, prev, TRUE, NULL::TEXT;
END;
$$;

-- ── submit: atomic one-shot consumption; WHERE clause is the race guard ──────
DROP FUNCTION IF EXISTS checkin_submit_token(UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION checkin_submit_token(
  p_token UUID,
  p_weight_kg NUMERIC,
  p_energy INTEGER,
  p_sleep INTEGER,
  p_stress INTEGER,
  p_hunger INTEGER,
  p_digestive INTEGER,
  p_adherence_pct INTEGER,
  p_training_adherence INTEGER DEFAULT NULL,
  p_waist_cm NUMERIC DEFAULT NULL,
  p_hip_cm NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_photos TEXT[] DEFAULT NULL,
  p_weight_deviation_kg NUMERIC DEFAULT NULL,
  p_weight_flagged BOOLEAN DEFAULT FALSE,
  p_ai_summary TEXT DEFAULT NULL
)
RETURNS TABLE (checkin_id UUID, out_client_id UUID, out_partner_id UUID, consumed BOOLEAN, invalid_reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated RECORD;
BEGIN
  UPDATE check_in ci
     SET status = 'completed',
         completed_at = now(),
         check_in_date = CURRENT_DATE,
         weight_kg = p_weight_kg,
         waist_cm = p_waist_cm,
         hip_cm = p_hip_cm,
         energy_level = p_energy,
         sleep_quality = p_sleep,
         stress_level = p_stress,
         hunger_level = p_hunger,
         digestive_health = p_digestive,
         adherence_pct = p_adherence_pct,
         training_adherence = p_training_adherence,
         notes = p_notes,
         photos = COALESCE(p_photos, ARRAY[]::TEXT[]),
         weight_deviation_kg = p_weight_deviation_kg,
         weight_flagged = COALESCE(p_weight_flagged, FALSE),
         ai_summary = p_ai_summary
   WHERE ci.token = p_token
     AND ci.status = 'pending'
     AND (ci.token_expires_at IS NULL OR ci.token_expires_at >= now())
  RETURNING ci.id, ci.client_id, ci.partner_id INTO updated;

  IF updated.id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, FALSE,
      (CASE
         WHEN NOT EXISTS (SELECT 1 FROM check_in WHERE token = p_token) THEN 'not_found'
         WHEN EXISTS (SELECT 1 FROM check_in WHERE token = p_token AND status <> 'pending') THEN 'already_completed'
         ELSE 'expired'
       END)::TEXT;
  ELSE
    RETURN QUERY SELECT updated.id, updated.client_id, updated.partner_id, TRUE, NULL::TEXT;
  END IF;
END;
$$;

-- ── least-scope grants ───────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION checkin_validate_token(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION checkin_submit_token(UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT[], NUMERIC, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_validate_token(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_submit_token(UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT[], NUMERIC, BOOLEAN, TEXT) TO anon, authenticated;
