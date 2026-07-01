-- 009_legal_documents.sql
-- Requirement #29 (Legal & GDPR compliance) — Stage 1: VERSIONED engagement-letter
-- template store. #29 is Tier 2 — the app generates + versions the letter; the
-- binding SIGNATURE is delegated to an eIDAS e-signature provider in Stage 2
-- (a signature_request table lands in that migration, NOT here).
--
-- This migration intentionally contains ONLY the versioned document store:
-- NO acceptance/audit table, NO storage bucket, NO consent/Tessera tables.
--
-- APPLY STANDALONE (Supabase SQL Editor or psql), NOT via the dev db:migrate
-- runner. Fully idempotent (CREATE ... IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS). Re-running the file is a no-op.
--
-- Immutability (KB §2 "previously accepted/published documents must never be
-- overwritten"): a legal_document_version row's CONTENT is never rewritten — a
-- new version is a NEW row. No updated_at column; not added to the 001 updated_at
-- trigger array; no deleted_at. `status` may transition active -> replaced/archived
-- (a lifecycle flag), and a BEFORE UPDATE trigger enforces that ONLY status may
-- change — content columns are frozen even against a partner's own RLS-scoped writes.

-- ── legal_document (one container per partner per doc_kind) ───────────────────
CREATE TABLE IF NOT EXISTS legal_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id),
  doc_kind TEXT NOT NULL CHECK (doc_kind IN ('engagement_letter', 'privacy_notice', 'health_consent')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, doc_kind)
);

CREATE INDEX IF NOT EXISTS idx_legal_document_partner ON legal_document(partner_id);

-- ── legal_document_version (immutable, versioned) ────────────────────────────
CREATE TABLE IF NOT EXISTS legal_document_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_document_id UUID NOT NULL REFERENCES legal_document(id),
  version_number INTEGER NOT NULL,
  version_label TEXT,
  language TEXT NOT NULL DEFAULT 'it',
  body_md TEXT NOT NULL,
  content_hash TEXT NOT NULL,       -- sha256(body_md), computed in the app
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'replaced')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (legal_document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_legal_document_version_doc ON legal_document_version(legal_document_id);
CREATE INDEX IF NOT EXISTS idx_legal_document_version_active ON legal_document_version(legal_document_id) WHERE status = 'active';

-- ── Immutability guard: legal_document_version content is frozen ──────────────
-- RLS grants partners UPDATE (needed for the active -> replaced status flip when
-- publishing a new version), but the document CONTENT must never be rewritten.
-- This trigger rejects any change to content columns; only `status` may change.
CREATE OR REPLACE FUNCTION legal_document_version_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.body_md IS DISTINCT FROM OLD.body_md
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.legal_document_id IS DISTINCT FROM OLD.legal_document_id
     OR NEW.language IS DISTINCT FROM OLD.language
     OR NEW.version_label IS DISTINCT FROM OLD.version_label
     OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'legal_document_version content is immutable; only status may change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legal_document_version_freeze ON legal_document_version;
CREATE TRIGGER trg_legal_document_version_freeze
  BEFORE UPDATE ON legal_document_version
  FOR EACH ROW EXECUTE FUNCTION legal_document_version_freeze();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE legal_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_document_version ENABLE ROW LEVEL SECURITY;

-- Partner-full (mirrors document_partner_access, 001:627). FOR ALL USING also
-- gates INSERT/UPDATE — Postgres reuses the USING expression as WITH CHECK when
-- none is given, exactly as the existing partner-table policies rely on. The
-- freeze trigger constrains what an UPDATE may actually change.
DROP POLICY IF EXISTS legal_document_partner_access ON legal_document;
CREATE POLICY legal_document_partner_access ON legal_document
  FOR ALL USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS legal_document_version_partner_access ON legal_document_version;
CREATE POLICY legal_document_version_partner_access ON legal_document_version
  FOR ALL USING (
    legal_document_id IN (
      SELECT id FROM legal_document
      WHERE partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
    )
  );

-- Client read-own (mirrors client_media_client_read, 002:56) — the in-scope
-- client may read their professional's published template (e.g. to view the
-- letter before signing). Defence-in-depth; the runtime path uses service role.
DROP POLICY IF EXISTS legal_document_client_read ON legal_document;
CREATE POLICY legal_document_client_read ON legal_document
  FOR SELECT TO authenticated
  USING (
    partner_id IN (SELECT partner_id FROM client WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS legal_document_version_client_read ON legal_document_version;
CREATE POLICY legal_document_version_client_read ON legal_document_version
  FOR SELECT TO authenticated
  USING (
    legal_document_id IN (
      SELECT ld.id FROM legal_document ld
      JOIN client c ON c.partner_id = ld.partner_id
      WHERE c.auth_user_id = auth.uid()
    )
  );

-- ── Verification (read-only; safe to run after apply) ─────────────────────────
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('legal_document','legal_document_version')
--   ORDER BY table_name;
-- SELECT tablename, policyname FROM pg_policies
--   WHERE policyname LIKE 'legal_%' ORDER BY tablename, policyname;
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_legal_document_version_freeze';
