-- 016_invoice_number_per_partner.sql
-- Tranche-2 (Fable sweep #1): fix the invoice-number multi-tenant collision.
--
-- Invoice numbers are computed PER-PARTNER (generateInvoiceNumber → RS-YYYY-0001,
-- scoped to partner_id), but 001 made invoice_number GLOBALLY unique
-- (idx_invoice_number ON invoice(invoice_number) WHERE deleted_at IS NULL). So a
-- SECOND partner's first invoice computes RS-2026-0001 — a number Roberto already
-- owns — and the INSERT hits the global unique index → 500. This swaps the global
-- index for a PER-PARTNER one so each partner has an independent RS-YYYY-NNNN run.
--
-- ⚠️ FOR JAMES — apply in the Supabase SQL editor (or psql) BEFORE merging the PR
-- (schema-before-code, same as 015). Do NOT run via the dev db:migrate runner.
--
-- DORMANT for a single coach (only fires with a 2nd partner / a test-coach account),
-- but the code fix (retry-on-conflict) now expects the per-partner constraint, so
-- apply this first. Fully idempotent (DROP … IF EXISTS / CREATE … IF NOT EXISTS).
-- SELF-CONTAINED: depends only on 001's invoice table.

-- Drop the GLOBAL unique index (invoice_number unique across ALL partners).
DROP INDEX IF EXISTS idx_invoice_number;

-- Per-partner unique: (partner_id, invoice_number), still excluding soft-deleted
-- rows. Two partners can now each hold RS-2026-0001; a partner still can't
-- duplicate its own number (the retry-on-conflict path relies on this).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number_partner
  ON invoice(partner_id, invoice_number) WHERE deleted_at IS NULL;
