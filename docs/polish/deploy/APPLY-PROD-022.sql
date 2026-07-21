-- ============================================================================
-- PROD APPLY — migration 022 + Roberto's practice identity. 2026-07-21.
-- Additive only. Run AFTER the 2026-07-20 apply (ledger 21/21).
-- ============================================================================
BEGIN;

ALTER TABLE partner_practice_profile ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;

INSERT INTO schema_migrations_applied (filename, checksum, applied_by)
VALUES ('022_practice_codice_fiscale.sql', NULL, 'prod-apply-2026-07-21')
ON CONFLICT (filename) DO NOTHING;

-- Roberto's practice identity (item 1, confirmed 2026-07-21).
-- Upserts the single partner row's letter fields; touches nothing else.
INSERT INTO partner_practice_profile (partner_id, professione, albo_ordine, albo_number, partita_iva, codice_fiscale, studio_address)
SELECT id, 'Biologo Nutrizionista', 'Ordine Nazionale dei Biologi', 'AA_077690', '10175580967', 'SCRRRT90S03F205Z', 'Via Don Luigi Guanella 44, 20128 Milano'
FROM partner
ON CONFLICT (partner_id) DO UPDATE SET
  professione = EXCLUDED.professione,
  albo_ordine = EXCLUDED.albo_ordine,
  albo_number = EXCLUDED.albo_number,
  partita_iva = EXCLUDED.partita_iva,
  codice_fiscale = EXCLUDED.codice_fiscale,
  studio_address = EXCLUDED.studio_address;

COMMIT;
-- Post-apply: SELECT count(*) FROM schema_migrations_applied;  -- expect 22
