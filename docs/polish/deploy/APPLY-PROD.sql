-- ============================================================================
-- PROD APPLY — migrations 017..021 in ONE transaction. 2026-07-20.
-- PRE-CONDITIONS (abort if not met):
--   1. PREFLIGHT-PROD.sql run: 001..016 all EXISTS, 017..021 all MISSING,
--      max_active_plans_per_client <= 1.
--   2. Database backup taken (Supabase dashboard -> Database -> Backups).
-- All statements are additive (tables/functions/columns/index). No existing
-- row is modified or deleted. On ANY error the transaction rolls back whole.
-- ============================================================================

BEGIN;

-- ────────────────────────── 017_checkin_token_rpc.sql ──────────────────────────
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


-- ────────────────────────── 018_migration_ledger.sql ──────────────────────────
-- 018_migration_ledger.sql
-- Durable, idempotent record of repository migrations applied to this database.

CREATE TABLE IF NOT EXISTS schema_migrations_applied (
  filename TEXT PRIMARY KEY,
  checksum TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL
);

ALTER TABLE schema_migrations_applied ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schema_migrations_applied_service_role_only
  ON schema_migrations_applied;
CREATE POLICY schema_migrations_applied_service_role_only
  ON schema_migrations_applied
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
VALUES
  ('001_initial_schema.sql', NULL, 'backfill-2026-07-20'),
  ('002_client_media_storage.sql', NULL, 'backfill-2026-07-20'),
  ('003_client_media_client_write.sql', NULL, 'backfill-2026-07-20'),
  ('004_training_log_session_type_freeform.sql', NULL, 'backfill-2026-07-20'),
  ('005_training_log_exercise_method_freeform.sql', NULL, 'backfill-2026-07-20'),
  ('006_plan_versioning_and_feedback.sql', NULL, 'backfill-2026-07-20'),
  ('007_placeholder_skipped.sql', NULL, 'backfill-2026-07-20'),
  ('008_plan_update_suggested_trigger.sql', NULL, 'backfill-2026-07-20'),
  ('009_legal_documents.sql', NULL, 'backfill-2026-07-20'),
  ('010_signature_requests.sql', NULL, 'backfill-2026-07-20'),
  ('011_snapshot_edit_audit.sql', NULL, 'backfill-2026-07-20'),
  ('012_reminder_settings.sql', NULL, 'backfill-2026-07-20'),
  ('013_urgent_feedback.sql', NULL, 'backfill-2026-07-20'),
  ('014_session_kcal_override.sql', NULL, 'backfill-2026-07-20'),
  ('015_partner_practice_profile.sql', NULL, 'backfill-2026-07-20'),
  ('016_invoice_number_per_partner.sql', NULL, 'backfill-2026-07-20'),
  ('017_checkin_token_rpc.sql', NULL, 'backfill-2026-07-20')
ON CONFLICT (filename) DO NOTHING;


-- ────────────────────────── 019_delivery_outbox_and_active_invariant.sql ──────────────────────────
-- 019_delivery_outbox_and_active_invariant.sql
-- T1.6a (register G8+G12): plan approval currently commits DB state, then fire-and-forgets
-- the Inngest event (swallowed on failure → client email permanently lost), and nothing
-- enforces one active plan per client (portal masks multiplicity with LIMIT 1).
-- Fix: a transactional approve — archive prior actives + activate + write a durable
-- outbox row — in ONE Postgres function, plus a partial unique index as the invariant.
-- G9's view signal (first_viewed_at) is added here; its consumers land in T1.6b.
-- Idempotent throughout.

-- ── durable delivery outbox ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON delivery_outbox(created_at) WHERE dispatched_at IS NULL;
ALTER TABLE delivery_outbox ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service-role only (bypasses RLS); anon/authenticated see nothing.

-- ── G9 view signal ───────────────────────────────────────────────────────────
ALTER TABLE plan ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;

-- ── one-active-plan invariant (G12) ─────────────────────────────────────────
-- Data fix first: keep only the NEWEST active per client, archive the rest.
UPDATE plan p
   SET status = 'archived'
 WHERE p.status = 'active'
   AND p.deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM plan p2
      WHERE p2.client_id = p.client_id
        AND p2.status = 'active'
        AND p2.deleted_at IS NULL
        AND (p2.created_at > p.created_at OR (p2.created_at = p.created_at AND p2.id > p.id))
   );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_plan_one_active_per_client
  ON plan(client_id) WHERE status = 'active' AND deleted_at IS NULL;

-- ── transactional approve ────────────────────────────────────────────────────
-- Runs as one transaction: archive prior actives → activate target → outbox row.
-- Ownership is asserted IN the function (partner_id param must match the row);
-- the router (protectedProcedure) supplies its own ctx.partnerId.
DROP FUNCTION IF EXISTS approve_plan_txn(UUID, UUID, JSONB);
CREATE OR REPLACE FUNCTION approve_plan_txn(
  p_plan_id UUID,
  p_partner_id UUID,
  p_event_payload JSONB,
  p_start_date DATE DEFAULT NULL
)
RETURNS TABLE (approved BOOLEAN, outbox_id UUID, prior_archived INTEGER, invalid_reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target RECORD;
  archived_count INTEGER := 0;
  ob_id UUID;
BEGIN
  SELECT id, client_id, status INTO target
    FROM plan
   WHERE id = p_plan_id AND partner_id = p_partner_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 'not_found'::TEXT; RETURN;
  END IF;
  IF target.status = 'active' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, 'already_active'::TEXT; RETURN;
  END IF;
  IF target.status NOT IN ('draft') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0, ('bad_status:' || target.status)::TEXT; RETURN;
  END IF;

  UPDATE plan SET status = 'archived'
   WHERE client_id = target.client_id AND status = 'active' AND deleted_at IS NULL;
  GET DIAGNOSTICS archived_count = ROW_COUNT;

  -- start_date preserved if set; else the activation date (feedback cadence anchor).
  UPDATE plan SET status = 'active',
                  start_date = COALESCE(start_date, p_start_date, CURRENT_DATE)
   WHERE id = p_plan_id;

  INSERT INTO delivery_outbox (event_name, payload)
  VALUES ('plan/delivered', p_event_payload)
  RETURNING id INTO ob_id;

  RETURN QUERY SELECT TRUE, ob_id, archived_count, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION approve_plan_txn(UUID, UUID, JSONB, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_plan_txn(UUID, UUID, JSONB, DATE) TO service_role;

-- ── outbox bookkeeping helpers (service-role only) ───────────────────────────
CREATE OR REPLACE FUNCTION outbox_mark_dispatched(p_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ UPDATE delivery_outbox SET dispatched_at = now(), attempts = attempts + 1 WHERE id = p_id; $$;

CREATE OR REPLACE FUNCTION outbox_mark_failed(p_id UUID, p_error TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ UPDATE delivery_outbox SET attempts = attempts + 1, last_error = left(p_error, 500) WHERE id = p_id; $$;

REVOKE ALL ON FUNCTION outbox_mark_dispatched(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION outbox_mark_failed(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outbox_mark_dispatched(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION outbox_mark_failed(UUID, TEXT) TO service_role;


-- ────────────────────────── 020_intake_txn.sql ──────────────────────────
-- 020_intake_txn.sql
-- T1.7 (register G10): client + initial snapshot are one atomic, idempotent write.

CREATE TABLE IF NOT EXISTS intake_idempotency (
  key TEXT PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partner(id),
  client_id UUID NOT NULL REFERENCES client(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE intake_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE intake_idempotency FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB);
CREATE OR REPLACE FUNCTION intake_create_client_with_snapshot(
  p_partner_id UUID,
  p_idempotency_key TEXT,
  p_client JSONB,
  p_snapshot JSONB
)
RETURNS TABLE (client_id UUID, snapshot_id UUID, was_replay BOOLEAN, invalid_reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved_client_id UUID;
  reserved_partner_id UUID;
  new_client_id UUID := gen_random_uuid();
  new_snapshot_id UUID := gen_random_uuid();
  replay_snapshot_id UUID;
  failure_phase TEXT := 'idempotency';
BEGIN
  IF NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'invalid_idempotency_key'::TEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO intake_idempotency (key, partner_id, client_id)
    VALUES (p_idempotency_key, p_partner_id, new_client_id)
    ON CONFLICT (key) DO NOTHING
    RETURNING intake_idempotency.client_id INTO reserved_client_id;

    IF reserved_client_id IS NULL THEN
      SELECT i.partner_id, i.client_id
        INTO reserved_partner_id, reserved_client_id
        FROM intake_idempotency i
       WHERE i.key = p_idempotency_key;

      IF reserved_partner_id IS DISTINCT FROM p_partner_id THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'idempotency_conflict'::TEXT;
        RETURN;
      END IF;

      SELECT cs.id INTO replay_snapshot_id
        FROM client_snapshot cs
       WHERE cs.client_id = reserved_client_id
       ORDER BY cs.taken_at ASC, cs.id ASC
       LIMIT 1;

      IF replay_snapshot_id IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'replay_incomplete'::TEXT;
      ELSE
        RETURN QUERY SELECT reserved_client_id, replay_snapshot_id, TRUE, NULL::TEXT;
      END IF;
      RETURN;
    END IF;

    failure_phase := 'client';
    INSERT INTO client (id, partner_id, full_name, email, phone, date_of_birth, sex, notes, tags)
    VALUES (
      new_client_id,
      p_partner_id,
      p_client->>'full_name',
      p_client->>'email',
      p_client->>'phone',
      (p_client->>'date_of_birth')::DATE,
      p_client->>'sex',
      p_client->>'notes',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_client->'tags', '[]'::JSONB)))
    );

    failure_phase := 'snapshot';
    INSERT INTO client_snapshot (
      id, client_id, weight_kg, height_cm, age_years, daily_steps,
      occupational_level, week_schedule, skinfold_data, body_fat_method,
      body_fat_pct, lean_mass_kg, fat_mass_kg, bmr_kcal, notes
    )
    VALUES (
      new_snapshot_id,
      new_client_id,
      (p_snapshot->>'weight_kg')::NUMERIC,
      (p_snapshot->>'height_cm')::NUMERIC,
      (p_snapshot->>'age_years')::INTEGER,
      (p_snapshot->>'daily_steps')::INTEGER,
      p_snapshot->>'occupational_level',
      ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'week_schedule')),
      p_snapshot->'skinfold_data',
      p_snapshot->>'body_fat_method',
      (p_snapshot->>'body_fat_pct')::NUMERIC,
      (p_snapshot->>'lean_mass_kg')::NUMERIC,
      (p_snapshot->>'fat_mass_kg')::NUMERIC,
      (p_snapshot->>'bmr_kcal')::INTEGER,
      p_snapshot->>'notes'
    );

    RETURN QUERY SELECT new_client_id, new_snapshot_id, FALSE, NULL::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, (failure_phase || '_failed')::TEXT;
  END;
END;
$$;

REVOKE ALL ON FUNCTION intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB)
  TO service_role;


-- ────────────────────────── 021_gdpr_mechanism.sql ──────────────────────────
-- 021_gdpr_mechanism.sql
-- GDPR operational mechanism only. Legal wording and consent text remain counsel-owned.
-- Idempotent: table/index creation is conditional; policies and functions converge on re-run.

-- The requested anonymization field is part of the client identity surface.
ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;

CREATE TABLE IF NOT EXISTS public.consent_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.client(id),
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  signature_request_id UUID REFERENCES public.signature_request(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_record_client
  ON public.consent_record(client_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_record_signature_request
  ON public.consent_record(signature_request_id)
  WHERE signature_request_id IS NOT NULL;

ALTER TABLE public.consent_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_record_partner_read ON public.consent_record;
CREATE POLICY consent_record_partner_read ON public.consent_record
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT c.id
      FROM public.client c
      WHERE c.partner_id IN (
        SELECT p.id FROM public.partner p WHERE p.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS consent_record_service_insert ON public.consent_record;
CREATE POLICY consent_record_service_insert ON public.consent_record
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS consent_record_service_update ON public.consent_record;
CREATE POLICY consent_record_service_update ON public.consent_record
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS consent_record_service_delete ON public.consent_record;
CREATE POLICY consent_record_service_delete ON public.consent_record
  FOR DELETE TO service_role USING (true);

REVOKE ALL ON TABLE public.consent_record FROM anon, authenticated;
GRANT SELECT ON TABLE public.consent_record TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.consent_record TO service_role;

CREATE OR REPLACE FUNCTION public.gdpr_export_client(
  p_partner_id UUID,
  p_client_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.client c
    WHERE c.id = p_client_id AND c.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'client not found for partner';
  END IF;

  RETURN jsonb_build_object(
    'client', (
      SELECT to_jsonb(c)
      FROM public.client c
      WHERE c.id = p_client_id AND c.partner_id = p_partner_id
    ),
    'client_snapshot', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.client_snapshot WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'check_in', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.check_in
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'diary_entry', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.diary_entry WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'training_log', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.training_log
        WHERE client_id = p_client_id
          AND (partner_id = p_partner_id OR partner_id IS NULL)
      ) r
    ), '[]'::jsonb),
    'plan', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.plan
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'invoice', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.invoice
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'document', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.document
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'message', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.message WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'notification', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.notification
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'signature_request', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.signature_request
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'legal_document_version', COALESCE((
      SELECT jsonb_agg(to_jsonb(ldv))
      FROM public.legal_document_version ldv
      WHERE EXISTS (
        SELECT 1
        FROM public.signature_request sr
        WHERE sr.document_version_id = ldv.id
          AND sr.client_id = p_client_id
          AND sr.partner_id = p_partner_id
      )
    ), '[]'::jsonb),
    'legal_document', COALESCE((
      SELECT jsonb_agg(to_jsonb(ld))
      FROM public.legal_document ld
      WHERE ld.partner_id = p_partner_id
        AND EXISTS (
          SELECT 1
          FROM public.legal_document_version ldv
          JOIN public.signature_request sr ON sr.document_version_id = ldv.id
          WHERE ldv.legal_document_id = ld.id
            AND sr.client_id = p_client_id
            AND sr.partner_id = p_partner_id
        )
    ), '[]'::jsonb),
    'snapshot_edit_audit', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.snapshot_edit_audit WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'urgent_feedback', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.urgent_feedback
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'client_reminder_settings', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.client_reminder_settings WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'consent_record', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.consent_record WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'client_media', COALESCE((
      SELECT jsonb_agg(to_jsonb(o))
      FROM storage.objects o
      WHERE o.bucket_id = 'client-media'
        AND (
          o.name LIKE 'client-photos/' || p_partner_id::text || '/' || p_client_id::text || '/%'
          OR o.name LIKE 'training-screenshots/' || p_partner_id::text || '/' || p_client_id::text || '/%'
        )
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gdpr_erase_client(
  p_partner_id UUID,
  p_client_id UUID,
  p_confirm TEXT
) RETURNS TABLE (
  erased BOOLEAN,
  tables_touched INTEGER,
  invalid_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  erased := false;
  tables_touched := 0;
  invalid_reason := NULL;

  IF p_confirm IS DISTINCT FROM 'ERASE' THEN
    invalid_reason := 'confirmation_mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client c
    WHERE c.id = p_client_id AND c.partner_id = p_partner_id
  ) THEN
    invalid_reason := 'client_not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  DELETE FROM public.diary_entry WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.check_in
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.training_log
  WHERE client_id = p_client_id
    AND (partner_id = p_partner_id OR partner_id IS NULL);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.snapshot_edit_audit WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Plans are retained, so their snapshot FK must be cleared before deleting snapshots.
  -- This is not identity severance: the retained plan still points to the anonymized client.
  UPDATE public.plan
  SET snapshot_id = NULL, updated_at = now()
  WHERE client_id = p_client_id
    AND partner_id = p_partner_id
    AND snapshot_id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.client_snapshot WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.notification
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.message WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.urgent_feedback
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.client_reminder_settings WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.document
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.signature_request
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.consent_record WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Fiscal retention choice: plan and invoice rows remain linked to the client row.
  -- The client identity is anonymized in place so retained clinical/fiscal records keep
  -- referential integrity without retaining the listed direct identifiers.
  UPDATE public.client
  SET full_name = 'Cliente eliminato',
      email = NULL,
      phone = NULL,
      codice_fiscale = NULL,
      notes = NULL,
      status = 'archived',
      deleted_at = now(),
      updated_at = now()
  WHERE id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Auth users and Storage objects are external to this transaction. The protected
  -- server router performs those two steps and reports each result independently.
  erased := true;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.gdpr_export_client(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gdpr_erase_client(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_export_client(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.gdpr_erase_client(UUID, UUID, TEXT) TO service_role;


-- ────────────────────────── ledger stamps ──────────────────────────
-- (018's own backfill covers 001..017; stamp the rest of this apply)
INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
VALUES
  ('018_migration_ledger.sql',                       NULL, 'prod-apply-2026-07-20'),
  ('019_delivery_outbox_and_active_invariant.sql',   NULL, 'prod-apply-2026-07-20'),
  ('020_intake_txn.sql',                             NULL, 'prod-apply-2026-07-20'),
  ('021_gdpr_mechanism.sql',                         NULL, 'prod-apply-2026-07-20')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- Post-apply sanity (run after COMMIT; expect 21):
SELECT count(*) AS ledger_rows FROM schema_migrations_applied;
