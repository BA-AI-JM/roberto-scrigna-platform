-- 024_invoice_payment_method.sql
-- C5 (Roberto's ruling 2026-07-21): record HOW a courtesy invoice was paid.
--   contanti   — cash
--   bonifico   — bank transfer (the IBAN block on the courtesy PDF)
--   sumup      — SumUp card reader
-- ADDITIVE + nullable: a draft/sent invoice has no method until it is paid;
-- markPaid (and create/update) may set it. Existing rows stay NULL.
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IS NULL OR payment_method IN ('contanti', 'bonifico', 'sumup'));
