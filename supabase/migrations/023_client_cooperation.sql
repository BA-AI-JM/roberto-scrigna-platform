-- 023_client_cooperation.sql
-- C1 (#2, Roberto's ruling 2026-07-21): cooperation types replace the
-- lifecycle-only status as the practice-truth about the relationship.
--   abbonamento  — recurring (yearly or period), optional date window
--   consulenza   — pay-per-visit, optional visit count, usually no window
--   fight_camp   — its OWN category: subscription-like but date-bounded
-- plus a free/no-cost flag (he works with some clients gratis).
-- ADDITIVE: existing status (active/paused/archived) remains the lifecycle;
-- engagement state derives from the dates at read time.

ALTER TABLE client ADD COLUMN IF NOT EXISTS cooperation_type TEXT
  CHECK (cooperation_type IN ('abbonamento', 'consulenza', 'fight_camp'));
ALTER TABLE client ADD COLUMN IF NOT EXISTS engagement_start DATE;
ALTER TABLE client ADD COLUMN IF NOT EXISTS engagement_end DATE;
ALTER TABLE client ADD COLUMN IF NOT EXISTS visit_count INTEGER
  CHECK (visit_count IS NULL OR visit_count >= 0);
ALTER TABLE client ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;
