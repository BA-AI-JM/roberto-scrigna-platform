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
A2 [M][EF-verify] (#8) Tolerance-delta math audit with fixture from Roberto's example.
A3 [M][EF-verify] (#10) Swap gram-equivalence audit (whey→kefir case) vs Model 1 tiers.
A4 [M] (#14) Plan-email → login → plan deep-link (returnTo through magic-link flow).
A5 [S] (#15) New-invoice client dropdown wiring.
A6 [S] (#1) Practice identity constants: order n° AA_077690, P.IVA, C.F., address
    (⚠ Don Luigi vs Luigi — confirm), rendered in lettera/invoice/PDF footer.

## B. The clinical model wired (#9 #10) + plan-builder UX (#6 #7 #11)
B1 [L][EF] (#10) Slot-class substitution wiring from Model 1 §1: class membership per
   meal slot (Colazione/Spuntino/Pranzo-Cena), tiered equivalence; DB = macro truth.
B2 [S][R][EF] (#9) Carbs>fats-on-training-days rule: Roberto defines the precise rule,
   engine encodes, golden fixtures.
B3 [M][R] (#6) Remove presets; periodization = weekly average | 2/3/4-day intensity
   split; per-day edit visibility.
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

## E. Fight-week module (Q4) [XL][R][EF]
E1 Template model from Model 1 §3: per-day water L, salt g, kcal/macros, weight
   target, notes; phases −7→weigh-in→refeed→fight day.
E2 Per-athlete instantiation anchored to fight date; coach edits all values (app
   never invents cut numbers — template values are Roberto's).
E3 Portal daily fight-week view (today's water/salt/targets/instructions).
E4 Post-weigh-in refuel/rehydration checklist rendering.
E5 PDF export of the full fight-week protocol.

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
J2 T3.3 async-state primitives; T3.9 a11y (labels, role=tab); charts polish.
J3 T1.11 rate limiter; T1.13-fix (pending EF4 from pack).
J4 Release seal: design re-score, full-suite + live e2e, prod deploy checklist,
   real-device pass, updated DEMO-SCRIPT.
