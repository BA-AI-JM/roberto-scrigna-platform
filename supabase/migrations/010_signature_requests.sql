-- 010_signature_requests.sql
-- Requirement #29 — in-app signature (SES) + provider-agnostic e-sign seam.
-- STACKS ON 009_legal_documents.sql: references legal_document_version. Apply
-- order is 009 then 010.
--
-- One shared table serving BOTH signing tiers behind the EsignProvider seam:
--   (1) internal SES (default) — the patient accepts in-app; we record who/when/
--       which-version and regenerate a stamped signed PDF on demand.
--   (2) a real eIDAS provider (Stage 2 / v1.5) — populates external_request_id /
--       signed_document_path / certificate_url / provider_audit_ref instead.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate
-- runner. Fully idempotent. Re-running is a no-op.
--
-- IMMUTABILITY: once status='signed', a BEFORE UPDATE trigger blocks ALL further
-- changes (mirrors the legal_document_version freeze pattern from 009).

-- ── signature_request (shared by both tiers) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS signature_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  partner_id UUID NOT NULL REFERENCES partner(id),
  document_version_id UUID NOT NULL REFERENCES legal_document_version(id),
  provider TEXT NOT NULL DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled')),
  accepted_at TIMESTAMPTZ,                 -- internal SES: when the patient accepted
  accepted_by UUID,                        -- auth.users.id of the accepting patient
  acceptance_method TEXT,                  -- e.g. 'in_app_ses'
  signed_document_path TEXT,               -- external providers only (internal regenerates on demand)
  external_request_id TEXT,                -- external provider's request id
  certificate_url TEXT,                    -- external provider's completion certificate
  provider_audit_ref TEXT,                 -- external provider's audit-trail reference
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signature_request_client ON signature_request(client_id);
CREATE INDEX IF NOT EXISTS idx_signature_request_partner ON signature_request(partner_id);
CREATE INDEX IF NOT EXISTS idx_signature_request_version ON signature_request(document_version_id);

-- ── Immutability guard: a signed request is frozen ───────────────────────────
CREATE OR REPLACE FUNCTION signature_request_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'signature_request is immutable once signed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_signature_request_freeze ON signature_request;
CREATE TRIGGER trg_signature_request_freeze
  BEFORE UPDATE ON signature_request
  FOR EACH ROW EXECUTE FUNCTION signature_request_freeze();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE signature_request ENABLE ROW LEVEL SECURITY;

-- Partner-full for their own clients' requests (create/read/manage). FOR ALL
-- USING also gates partner INSERT/UPDATE (USING reused as WITH CHECK).
DROP POLICY IF EXISTS signature_request_partner_access ON signature_request;
CREATE POLICY signature_request_partner_access ON signature_request
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

-- Client may READ their own requests.
DROP POLICY IF EXISTS signature_request_client_read ON signature_request;
CREATE POLICY signature_request_client_read ON signature_request
  FOR SELECT TO authenticated
  USING (
    client_id IN (SELECT id FROM client WHERE auth_user_id = auth.uid())
  );

-- NO client UPDATE policy — intentional. The ONLY acceptance path is the
-- server-side service-role router (signature.acceptSignature), which bypasses RLS
-- and authoritatively stamps status='signed' + accepted_by=<authenticated client>.
-- A prior version granted a client-direct UPDATE (accept -> signed), but its
-- WITH CHECK did not pin partner_id / document_version_id / accepted_by, so a
-- JWT-armed client could, in the same accept, reassign the request into another
-- partner's tenant scope or forge the acceptor. With RLS enabled and no client
-- UPDATE policy, such a write is default-denied outright. DROP any previously
-- applied instance so re-running converges to the hardened state (idempotent).
DROP POLICY IF EXISTS signature_request_client_accept ON signature_request;

-- ── Verification (read-only; safe to run after apply) ─────────────────────────
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'signature_request';
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename = 'signature_request' ORDER BY policyname;
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_signature_request_freeze';
