-- 011_snapshot_edit_audit.sql
-- #5 (retroactive measurement editing): an APPEND-ONLY audit trail of coach edits
-- to a past client_snapshot (client.editSnapshot). Each edit records the changed
-- fields (before -> after, changed-only) + who edited + when.
--
-- MIGRATION NUMBER: 011 — the previously-missing number in the sequence
-- (009/010 = #29, 011 = #5 THIS FILE, 012 = #07, 013 = #28, 014 = #10). Independent
-- of every other branch: it adds ONE new table and touches NO shared object (in
-- particular it does NOT alter notification_trigger_check or any other constraint).
-- Applies BEFORE 012 (only ordering requirement: after 001, which defines
-- client_snapshot + client).
--
-- APPEND-ONLY: this table has INSERT + SELECT RLS policies and NO update/delete
-- policy, so RLS default-denies UPDATE and DELETE for authenticated users — the
-- audit trail is immutable, mirroring the legal_document_version / signature_request
-- immutability pattern (here achieved purely by absence of a write path, since —
-- unlike signature_request — there is no legitimate client/partner update path).
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate runner.
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE) —
-- re-running is a no-op. Writes NO application data.

CREATE TABLE IF NOT EXISTS snapshot_edit_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES client_snapshot(id),
  client_id UUID NOT NULL REFERENCES client(id),
  edited_by UUID,                       -- auth.users.id of the editing partner
  changed_fields JSONB NOT NULL,        -- { field: { before, after } } — changed-only
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_edit_audit_snapshot
  ON snapshot_edit_audit(snapshot_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_edit_audit_client
  ON snapshot_edit_audit(client_id, edited_at DESC);

ALTER TABLE snapshot_edit_audit ENABLE ROW LEVEL SECURITY;

-- Partner may INSERT audit rows for their OWN clients' snapshots (client → partner).
DROP POLICY IF EXISTS snapshot_edit_audit_partner_insert ON snapshot_edit_audit;
CREATE POLICY snapshot_edit_audit_partner_insert ON snapshot_edit_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (
      SELECT id FROM client
      WHERE partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
    )
  );

-- Partner may READ their OWN clients' audit rows.
DROP POLICY IF EXISTS snapshot_edit_audit_partner_read ON snapshot_edit_audit;
CREATE POLICY snapshot_edit_audit_partner_read ON snapshot_edit_audit
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT id FROM client
      WHERE partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
    )
  );

-- NO update / delete policy — intentional. Append-only: RLS default-denies UPDATE
-- and DELETE, so once written an audit row can never be changed or removed.

-- ── Verification (read-only; safe to run after apply) ─────────────────────────
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'snapshot_edit_audit';
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename = 'snapshot_edit_audit' ORDER BY policyname;
--   → expect exactly 2 policies: snapshot_edit_audit_partner_insert (INSERT),
--     snapshot_edit_audit_partner_read (SELECT). No UPDATE/DELETE policy.
