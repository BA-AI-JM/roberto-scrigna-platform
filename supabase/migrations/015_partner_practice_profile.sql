-- 015_partner_practice_profile.sql
-- #29 completion: the practitioner "practice profile" — Roberto enters his
-- practice details ONCE (Albo, P.IVA, studio, insurer, fee, foro, terms…) and
-- every engagement letter auto-fills them via the {{merge tokens}} that replaced
-- the template's [PLACEHOLDER: …] markers.
--
-- ⚠️ FOR JAMES — apply in the Supabase SQL editor (or psql) BEFORE merging the PR.
-- Do NOT run via the dev db:migrate runner. The generation wiring is code-complete
-- but the live auto-fill only lights up once this table exists.
--
-- TABLE-vs-COLUMNS CHOICE: a SEPARATE table (one row per partner) rather than 19
-- new columns on `partner`. Reasons: (a) matches the app's table-per-concern
-- pattern (client_reminder_settings, notification_settings, signature_request…);
-- (b) keeps the hot `partner` row lean — these fields are rarely read/written and
-- only by the letter path; (c) clean, self-contained RLS; (d) trivially extensible.
--
-- SELF-CONTAINED: depends only on 001's `partner` table. The '015' number just
-- sorts it last; apply any time after 001. Fully idempotent (CREATE … IF NOT
-- EXISTS / DROP POLICY … IF EXISTS) — re-running is a no-op. All fields are
-- nullable free TEXT: an empty field renders as "[DA COMPLETARE: <label>]" in the
-- letter (never blank/broken), so an unfilled profile still shows what's missing.

-- ── partner_practice_profile (one row per partner) ───────────────────────────
CREATE TABLE IF NOT EXISTS partner_practice_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner(id) UNIQUE,

  -- Studio / registration
  professione        TEXT,   -- es. "Biologo Nutrizionista" / "Dietista"
  albo_ordine        TEXT,   -- Albo/Ordine di iscrizione (es. "ONB")
  albo_number        TEXT,   -- numero di iscrizione all'Albo
  partita_iva        TEXT,
  studio_address     TEXT,   -- indirizzo dello studio
  delivery_mode      TEXT,   -- "studio" / "da remoto" / "piattaforma/app"

  -- Prestazione
  plan_delivery_days TEXT,   -- giorni per la consegna del piano (§2 "entro N giorni")
  cadenza            TEXT,   -- cadenza dei controlli

  -- Compenso / fiscale
  fee_importo        TEXT,   -- importo del compenso (€)
  cassa_iva          TEXT,   -- cassa previdenziale / IVA
  fee_articolazione  TEXT,   -- articolazione del compenso
  payment_metodo     TEXT,   -- metodo di pagamento
  payment_termine    TEXT,   -- termine di pagamento

  -- Durata / recesso
  durata                    TEXT,  -- durata dell'incarico
  cancellation_notice_hours TEXT,  -- preavviso di disdetta in ore (§6 "N ore")
  penale                    TEXT,  -- penale per mancata disdetta

  -- Assicurazione
  numero_polizza     TEXT,   -- numero polizza RC professionale
  assicuratore       TEXT,   -- compagnia assicurativa

  -- Legale
  foro               TEXT,   -- foro competente

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_practice_profile_partner
  ON partner_practice_profile(partner_id);

-- ── RLS: a partner reads/writes ONLY their own profile ───────────────────────
ALTER TABLE partner_practice_profile ENABLE ROW LEVEL SECURITY;

-- Mirrors partner_self / *_partner_access: the row's partner must resolve to the
-- caller's auth uid. FOR ALL also gates INSERT/UPDATE (WITH CHECK inherits USING).
DROP POLICY IF EXISTS partner_practice_profile_partner_access ON partner_practice_profile;
CREATE POLICY partner_practice_profile_partner_access ON partner_practice_profile
  FOR ALL
  USING (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    partner_id IN (SELECT id FROM partner WHERE auth_user_id = auth.uid())
  );
