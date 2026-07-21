# Product-completion plan — 2026-07-21

Source inputs: feedback register items 1–17 (docs/polish/ROBERTO-FEEDBACK-2026-07-21.md),
the 8 macro answers (2026-07-21), Model 1 reference (docs/reference/MODEL-1-ENG.md),
open arc backlog. Status: AWAITING Liam+Roberto once-over. Tags: [S/M/L/XL] size ·
[R] needs Roberto decision/sign-off · [EF] clinical, engine-adjacent, value-equivalence
gated per NORTHSTAR. Register item numbers in (#n).

Sequencing: A→B ship first (Roberto is live-testing). C–E next (daily workflow).
F–H are the new feature builds. I–K thread through and close.

## A. Correctness first — active bugs (#5 #8 #10-math #14 #15)
A1 [M] (#5) Training-edit "invalid" repro+fix; RPE→kcal live recalc.
A2 [M][EF-verify] (#8) Tolerance-delta math audit. Golden fixtures (Roberto 2026-07-21):
    (1) shown −86 vs hand −81.5 (~5% — hypothesis: food-label kcal vs 4/4/9 Atwater, legit
    → label the UI "Δ da valori alimenti"); (2) shown +15 vs hand +31.7 (>2× — suspected
    REAL seam bug). Trace both through engine→bundle→render; fix (2); document (1).
A3 [M][EF-verify] (#10) Swap gram-equivalence audit (whey→kefir case) vs Model 1 tiers.
A4 [M] (#14) Plan-email → login → plan deep-link (returnTo through magic-link flow).
A5 [S] (#15) New-invoice client dropdown wiring.
A6 [S] (#1) Practice identity constants: Biologo Nutrizionista n° AA_077690, P.IVA
    10175580967, C.F. SCRRRT90S03F205Z, Via Don Luigi Guanella 44 20128 Milano
    (CONFIRMED), rendered in lettera/invoice/PDF footer.

## B. The clinical model wired (#9 #10) + plan-builder UX (#6 #7 #11)
B1 [L][EF] (#10) Slot-class substitution wiring from Model 1 §1: class membership per
   meal slot (Colazione/Spuntino/Pranzo-Cena), tiered equivalence; DB = macro truth.
B2 [DONE 2026-07-21][EF] (#9) Carb-led tier rule encoded from Roberto's answers:
   tier kcal deltas allocated as cereal composition (+12.5P/+1.5F per 350 kcal,
   carbs absorb remainder exactly); engine applies + signals via assumptions;
   absolute overrides bypass. src/engine/carb-led-tiers.ts, 6 goldens.
B3 [M] (#6) Remove presets; periodization modes (FINAL, Roberto 2026-07-21):
   ① Media settimanale ② OFF + ON (ON = average caloric expenditure of training days)
   ③ OFF–Leggero–Medio ④ OFF–Leggero–Medio–Intenso (③/④ when per-day delta justifies
   a personalised day). Per-day edit affordances visible.
B4 [M] (#7) Two sessions per day (schema perDaySessions[] already array? verify) + UI.
B5 [M] (#11) Merge Panoramica+Macro review tabs.

## C. Client & practice management (#2 #4 #12 #16 + payments)
C1 [L][R-shape-confirmed] (#2) Cooperation types: abbonamento | consulenza (visit
   count) | fight camp (own type, date-bounded) | free/no-cost flag; optional calendar
   duration picker; derived status + expiry reminders.
C2 [M] (#4) Anamnesis editable post-intake + new fields: surgeries, medications
   (type/dosage/changes), injuries, gut/digestive status.
C3 [S][R] (#12) Check-in frequency: single home (client profile, shown in Monitoraggio).
C4 [S] (#16) "Nuova fattura" from client detail, pre-filled.
C5 [M] Payments: method enum (contanti | bonifico | SumUp), manual mark-paid from
   client profile + invoice; courtesy-invoice footer (Q1); IBAN block on documents.

## D. Portal & client experience (#13 + Q3)
D1 [S] (#13) Check-in adds: training quality 0–10, digestion/gut 0–10 (schema+forms+
   coach review + trends).
D2 [S] Weekly-average weight auto-computed and shown (portal + coach).
D3 [L][EF] Q3 "day checker": client-side meal-structure changes/swaps validated
   against assigned daily targets using B1 classes; shows resulting macro state.
D4 [M] Portal polish: dark theme pass (T3.5), emoji→icons, a11y basics.

## E. Fight-week module (Q4) [XL][EF] — template model CONFIRMED by Roberto 2026-07-21 (+ planned-weight amendment)
Reference: docs/reference/fight-week/ (two real protocols; variance notes in its README).
Principle: the app NEVER computes a cut — only arithmetic (countdowns, rehydration
totals from entered cut at editable 150%/70% coefficients, ÷3 refuel helper).
E1 Data model — FightWeekProtocol: athlete, weighInDate (+early/late flag), optional
   fightDate/time, weight-class target, notes; instantiated from coach-owned template
   library (seeded from both reference docs).
E2 DayRow (−7…−1, weigh-in): water (value or min–max mL) · salt g · training label
   (free text) · kcal/P/F/C · optional fibre cap · constraint flags (NO_SALT,
   LOW_FIBRE, NO_WHOLEGRAIN, NO_VEG, FRESH_FOOD_ONLY) · free-text meal template ·
   conditional notes · PLANNED WEIGHT kg (AMENDMENT 2026-07-21: first-class, not
   optional — Roberto authors/edits the fighter's per-day weight trajectory ahead of
   time and can adjust any individual day mid-week) + actual morning-weight log;
   plan-vs-actual variance visible per day (drives the "we modify according to how
   much you lose" loop).
E3 Weigh-in block: fasted flag, day-before options, cutting-work cycles (15–30'
   active/passive), orthostatic-hypotension safety line (always rendered).
E4 RehydrationPlan: total = editable % of cut (default 150), prepared-in-bottles %
   (default 70), timed bolus schedule rows, drink recipe (½-dose electrolyte +
   40–60 g/L carbs), ÷3 INS helper (deficit → 2/3 liquid + 1/3 dense food).
E5 RefuelTimeline: phases 0–1h (liquids-only-if-dehydrated) / 1–2h / 2–3h / 3h+
   (1.2 g/kg/h), each with content, examples, macro ranges; per-24h targets
   (e.g. P 120–150 / F 50–70 / C 650–800 / fibre <20); per-meal ritual (creatine
   4–6g + enzymes + ~2g salt shot); fluids ≥1L/h first 4–6h.
E6 MatchDayPlan: meal templates with early/late-match variants; final-60' stack;
   final-5' honey/ginger item.
E7 Attached protocol blocks (F): fight-week supplements, cramps/TRPA1 + mouth rinse,
   fight-week plant foods, shopping/pharmacy/equipment — referenced, not duplicated.
E8 Surfaces: coach grid editor + countdown; portal daily fight-week card (water with
   bolus rhythm, salt, training, macros, meals, badges, notes, weight log) flipping
   to rehydration/refuel checklist post-weigh-in; full-protocol PDF export.
E9 NOT in v1: no auto-generated cut numbers, no sweat-rate models, no wearables.
E10 Build gate: golden render fixtures — BOTH reference docs reproduced through the
   template model without loss before UI work starts.
E11 Build notes (code recon, line-verified 2026-07-21): engine already has
   waterLoadingSchedule (hydration.ts:88) + CombatProtocols fibre/sodium caps
   (plan-generator.ts:130-137) — bundle carries waterLoading, portal.ts:207 returns it
   ("UI renders in T3.5" pending), NO render path exists in portal or PDF yet.
   PDF slots cleanly: add renderFightWeek page after day-type pages
   (html-renderer.ts:505-586 pattern). DESIGN FORK to decide at build: bundle-embedded
   (waterLoading precedent; relative days) vs normalized tables. RECOMMENDATION:
   normalized (fight_week_protocol + fight_week_day + template library) — fight week
   is coach-AUTHORED, date-anchored, edited daily mid-cut; a bundle blob would force
   regeneration semantics on every edit. Existing waterLoading/fibre/sodium engine
   output stays as-is and links INTO the protocol view, not replaced.

## F. Protocol blocks (Q5) [L]
F1 Reusable content blocks (cold, heat, supplements, refeed, cutting kit — seeded
   from Model 1) attachable to plans; rendered in portal + PDF; coach-editable.

## G. Financial dashboard (#17) [L]
G1 Build per approved mock: KPIs, 12-month chart, per-athlete economics, aging,
   pricing intelligence, "da fatturare" — cooperation-type segmentation lands with C1.

## H. Internationalization (Q7) [XL]
H1 i18n framework + string extraction pattern (early, so new features are built
   translatable); per-user language (coach + per-client portal).
H2 Full IT/EN translation pass incl. PDFs/emails.

## I. Data import (Q6) [M][R]
I1 Import path for last-year clients: minimal fields (anagrafica) via assisted
   CSV/manual; optional measurements; recent clients first.

## J. Hardening & release (arc backlog)
J1 Wave B hex→token sweep (remaining coach pages) + theme toggle UI.
J2 T3.3 async-state primitives; T3.9 a11y (labels, role=tab); charts polish;
   C3 follow-up: read-only 'Frequenza check-in' pointer on Monitoraggio linking
   to the client card (single-writer preserved).
J3 T1.11 rate limiter; T1.13-fix (pending EF4 from pack).
J4 Release seal: design re-score, full-suite + live e2e, prod deploy checklist,
   real-device pass, updated DEMO-SCRIPT.
