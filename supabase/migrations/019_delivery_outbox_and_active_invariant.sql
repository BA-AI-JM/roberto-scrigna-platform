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
