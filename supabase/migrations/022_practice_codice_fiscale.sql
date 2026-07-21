-- 022_practice_codice_fiscale.sql
-- A6 (#1): the practitioner's own codice fiscale on the practice profile —
-- rendered in the lettera di incarico professional line ({{codice_fiscale}}).
ALTER TABLE partner_practice_profile ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
