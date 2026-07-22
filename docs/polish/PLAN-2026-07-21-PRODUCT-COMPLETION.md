# Product-completion plan — consolidated (2026-07-21)

Source inputs: round-2 feedback R1–R16 (docs/polish/ROBERTO-FEEDBACK-2026-07-21-R2.md,
operator-confirmed "happy with this list"); round-1 items 1–17 (docs/polish/ROBERTO-FEEDBACK-2026-07-21.md,
all closed or superseded — cross-reference only); Model 1 reference (docs/reference/MODEL-1-ENG.md);
NORTHSTAR.md + DIRECTION.md (governing); the not-yet-done tail of the prior plan (old waves D–J).
Status (updated 2026-07-22): **Waves A/B/C/D1–D4 SHIPPED; brand re-tuned to blue; D5 (Model B) engine core shipped + Roberto-signed, wizard/seam/cleanup remaining; E–J remaining.** Both prior blockers resolved: R8 confirmed fibre-driven (10–20 g/1000 kcal, veg ceiling **400**); R14 SIGNED (`3a6abc3`). See the shipped ledger below; every DONE row cites a commit on `polish/audit-arc-2026-07`.

Tags: `[S/M/L/XL]` size · `[EF]` clinical / engine-adjacent / value-equivalence-gated per
NORTHSTAR (the engine never invents a clinical value) · `[R-confirm]` needs a Roberto decision
before build · `[PROD-STATE]` operational, no code · `[SHIPPED]` in code, verify-only ·
`[PARKED]` operator-deferred, not work · `[DONE]` shipped this arc. Round-2 ids in **(Rn)**;
prior-plan ids in **(old Xn)**.

## SHIPPED ledger (2026-07-22)

| Wave / item | Status | Evidence (sha) |
|-------------|--------|----------------|
| A1–A6 correctness | ✅ DONE | `0fcd0fc` (A1+A5), `feb20d2` (A2+A3), `9b7f49e` (A4), `ade9ed3` (A6), `0c1ebe2` (adversarial F1/F2/F3/F5) |
| B1–B5 clinical + wizard | ✅ DONE | `b4aab54` (B1+B5), `beaec7d` (B2), `aeaa720` (B3+B4) — ⚠ B3 four-mode tier **superseded by D5/Model B** |
| C1–C5 client & practice | ✅ DONE | `3d9b04d`+`1739aa9` (C1), `3174321`+`d714975` (C2), `17592cd` (C3+C4), `d10e275`+`db0237d` (C5 payments) |
| D1 quick wins (R13/R16/R7/R6) | ✅ DONE | `d4a78df` |
| D2 check-in reply loop (R3/R4) | ✅ DONE | `245eee4` |
| D3a/D3b (R5 salt=1g/L · R8 veg floor 100 g) | ✅ DONE | `d10168d` |
| D3c (R9 peri-workout + intra water) | ✅ DONE | `d1d1566` |
| D4 (R1 manual BF% + Harris-Benedict) | ✅ DONE | `d60350f` |
| EF4 tolerance ±5%/±10% (G33) + R8 fibre band | ✅ DONE | `098cfdb` |
| Brand re-tune teal→blue (Workstream A) | ✅ DONE | `8456825` (`src/app/globals.css:22,50`) |
| D5 sign-off (R14) | ✅ SIGNED | `3a6abc3`; one-pager `e8ec319`; design `docs/polish/D5-DESIGN-DAY-TYPES.md` |
| D5 engine core (R15 + Model B targets) | ✅ DONE | `47f93b0` (B-eng1/R15), `bb97583` (B-eng2), handoff `7408530` |
| **D5 B-ui / B-seam / B-cleanup** | ◐ REMAINING | wizard rebuild + serialization v3 + label retire — see `docs/polish/MODEL-B-HANDOFF.md` |
| D6 client-side day checker | ◻ REMAINING | not started |
| D7a/D7b portal residuals | ◻ REMAINING | weekly-average weight + dark/a11y pass |
| E fight-week | ◻ DESIGNED, NOT BUILT | model confirmed `639af04`, build notes `6f4a287` |
| F protocol blocks | ◻ REMAINING | not started |
| G finance dashboard | ◻ MOCK ONLY | branded mock `c96d364` (`concepts/finance-dashboard-mock.html`) — not built |
| H i18n | ◻ NOT STARTED | — |
| I data import | ◻ NOT STARTED | — |
| J hardening | ◐ PARTIAL | J2 note `4c7d4d0`; rest remaining |
| MET retuning | ⏸ PARKED | operator-deferred |

## Sequencing (the intelligence, stated once)

Waves A/B/C are **DONE** (A1–A6, B1–B5, C1–C5 shipped) — summarised below for context, not
re-planned. Round-2 feedback R1–R16 is folded into a new **Wave D**, the immediate next work,
split D1–D7. The prior plan's tail keeps its letters and content: **E** fight-week, **F**
protocol blocks, **G** finance, **H** i18n, **I** import, **J** hardening. The prior "D. Portal"
wave is absorbed into new Wave D (old D3 day-checker → **D6**; old D1/D2/D4 → **D2**/**D7**) —
"Wave D" now denotes round-2 work, so old D3 is renumbered exactly as flagged.

Load-bearing ordering decisions:

1. **R14 SUPERSEDES B3.** B3 shipped the four-mode tier system (`periodization-modes.ts`;
   DayType tiers `training_light/medium/intense/double` + `refeed/deload` at
   `src/engine/types.ts:20-28`). R14 replaces it with **OFF / 1-session / 2-session / 3-session
   days only**; the day's energy *emerges* from the scheduled sessions' per-day TDEE (already
   computed via `perDayTrainingSession → ExerciseSession[]`). So R14's build **deletes** those
   surfaces — **no polish, no fixes are planned on anything R14 removes.**
2. **R12 + R11 are ABSORBED into R14 (D5), not standalone items.** R12 (mode-change wipes the
   entered schedule) is caused by a periodization-mode template overwriting the whole `DayType[7]`;
   R14 removes the mode-template mechanism entirely (day type = session count = the schedule), so
   R12's fix is inherent to the rebuild. R11 (two sessions/day) already shipped in B4
   (`WeekSessionsEditor.addSession`) — re-verify it *through the new model*, not before.
3. **R15 rides the SAME engine seam as R14** (`src/server/routers/plan.ts:452-466`, where
   `perDayTrainingSession` becomes `engineOptions`). One engine change, two facets: R14 = day
   energy emerges from scheduled sessions; R15 = a per-session manual kcal *replaces* MET when set
   and feeds that expenditure. **R15 deliberately inverts the display-only invariant** pinned in
   `src/server/routers/__tests__/session-kcal-override.test.ts:179-186` — that test is named here
   as one to be **updated**, not kept green as-is.
4. **MET-value retuning is PARKED** (operator ruling): a post-fix review with Roberto, not work.
   R15 is the structural fix; the 1,626-kcal MET question is deferred behind it.
5. **R2 is NO WORK** — prod DB missing migrations 023/024 (`client.list` errors). Resolved by the
   SQL paste / rollback; **verify-after-SQL only.**
6. **Quick wins front-loaded** (small, independent, Roberto is live-testing): R13, R16, R7, R6 →
   **D1**. R13 touches the same editor R14 rebuilds — it ships now as a display-only header add and
   R14 preserves it (coupling noted at D1a).
7. **All Roberto inputs are now closed (2026-07-22).** R14 signed (`3a6abc3`); R8's two ⚠ resolved —
   veg ceiling = **400** (`d10168d`) and portions are **fibre-driven** 10–20 g/1000 kcal inverse
   (`098cfdb`), not a raw scaling shape. R5's numbers shipped; R1's Harris-Benedict shipped. Nothing blocks.

---

## DONE — Waves A/B/C (context; not re-planned)

- **A** correctness bugs (A1 training-edit + A5 invoice dropdown `0fcd0fc` · A2 tolerance + A3 swap
  equivalence `feb20d2` · A4 plan-email deep-link `9b7f49e` · A6 practice identity `ade9ed3` ·
  adversarial F1/F2/F3/F5 `0c1ebe2`) — **shipped**.
- **B** clinical model + plan-builder UX (B1 slot-class + B5 merged tabs `b4aab54` · B2 carb-led tiers
  `beaec7d` · **B3 four periodization modes** + B4 two-sessions/day `aeaa720`) — **shipped**.
  ⚠ **B3 is superseded by R14/D5** (Model B retires the four-mode tier system — see D5).
- **C** client & practice management (C1 cooperation types `3d9b04d`+`1739aa9` · C2 anamnesis
  `3174321`+`d714975` · C3 check-in freq + C4 invoice-from-client `17592cd` · C5 payments
  `d10e275`+`db0237d`) — **shipped**.

---

## Wave D — Round-2 correctness & clinical feedback (R1–R16)

### D1 — Quick wins (front-loaded; independent) [S each] — ✅ DONE `d4a78df`

**D1a [S] (R13) Column headers on the week-structure session rows.**
- File: `src/components/week-sessions-editor.tsx` — sessions render as cards with inline per-field
  labels ("Modalità"/"Durata (min)"/"RPE" at L173-234); add a sticky column-header row
  (Modalità · Durata min · RPE) above the day's session grid.
- Coupling: D5/R14 rebuilds this editor; the header treatment is preserved through that rebuild.
- Accept: headers render above the session grid on intake + client-edit; component render test.

**D1b [S] (R16) Supplement double-assign fix.**
- Files: `src/components/plan/supplements-editor.tsx:196-201` (library "Aggiungi" button calls
  `onAddEntries([libraryItemToEntry(item)])` with no dedupe); `src/components/plan/supplement-helpers.ts`.
- Guard the add against an already-present id; filter assigned items out of the picker `groups`
  (`supplements-editor.tsx:70-74`) so a picked item leaves the list — mirror the `coreSetEntries`
  dedupe precedent (already supplement-aware at L76).
- Accept: double-click adds once; assigned item disappears from the picker; helper unit test.

**D1c [S] (R7) Daily macro recap line above each day's meals.**
- Files: `src/app/(dashboard)/plans/[id]/review/page.tsx` (per-day render; reuse the existing
  scannable daily-totals grammar + `MACRO_ACCENTS` at ~L83-104 and `MEAL_LABELS` ~L100);
  `src/components/portal/active-plan-view.tsx`.
- Add a kcal/P/C/F recap line at the top of each day's meal list (in addition to the column).
- Accept: recap line renders above the meals on coach review + portal.

**D1d [S] (R6) Fibre shown per meal / per day.**
- Engine already tracks `fibreG` (`src/engine/meal-plan/solver.ts:614`; carried in meal-plan types).
- Surface it in the review page, portal, and PDF alongside the macro figures.
- Accept: fibre grams shown per meal and per day total; no engine change (display-only).

### D2 — Check-in review loop (R3, R4) [M] — ✅ DONE `245eee4`

**D2a [M] (R3) Reply to a check-in.** *(absorbs old D1 check-in questionnaire — already collected)*
- Column exists; write + read paths exist: `checkin.markReviewed` writes `review_notes`
  (`src/server/routers/checkin.ts:491-504`); `checkin.getLatestCompleted` returns it
  (`checkin.ts:405-429`); `src/components/client/feedback-card.tsx:102-115` already renders a
  "Note del coach" block when present.
- Build: coach compose UI on the check-in surface (`src/app/(dashboard)/clients/[id]/page.tsx` —
  `FeedbackCard` import L22; check-in list L780/L1030) wired to `markReviewed({ reviewNotes })`;
  client-facing display in the portal (`src/app/portal/(protected)/feedback/page.tsx`); notify the
  client via a new `checkin/reviewed` inngest event (pattern: `checkin.ts:158` `checkin/due`,
  `checkin.ts:338` `checkin/weight-alert`).
- Accept: coach writes a note → portal shows "Note del nutrizionista" + client is notified;
  lexicon is *il tuo nutrizionista* (DIRECTION §7).

**D2b [S] (R4) Feedback review shows EVERY answer.**
- The stored answer set is complete (`submitCheckin` persists energy/sleep/stress/hunger/digestive/
  adherence/training-adherence/notes — `checkin.ts:296-303`) but `getLatestCompleted` selects only a
  subset (`checkin.ts:411-414`) and `feedback-card.tsx` shows 4 metrics (L122-137).
- Expand the `getLatestCompleted` select to add `stress_level, hunger_level, digestive_health,
  training_adherence, notes`; expand the review surface to render all 0–10 scales + free text, not
  the 4-field summary card. No migration.
- Accept: review shows all scales (energy/sleep/stress/hunger/digestive) + training adherence +
  free-text notes.

### D3 — EF macro & hydration retune (R5, R8, R9) [EF] — ✅ DONE `d10168d` (D3a/D3b) · `d1d1566` (D3c) · fibre band `098cfdb`

**D3a [M][EF] (R5) Salt = 1 g per 1 L water; water 30–40 mL/kg.**
- File: `src/engine/hydration.ts:14-48`. Current rule is the flat `BASE_SALT_G = 5` (L20) +
  `TRAINING_SALT_BONUS_G = 1.5` (L23) → **6.5 g on training days** — exactly Roberto's "6.5 g/day
  observed = wrong". Replace with `saltG = round(waterMl / 1000 × 1)` derived from the computed
  water target. Confirm `BASE_WATER_ML_PER_KG = 37.5` (L14) sits inside Roberto's 30–40 mL/kg band
  (it does) — keep, or expose as a parameter.
- EF: clinical constant; value-diff golden required.
- Accept: 85 kg training day → water ~3.7 L, salt ~3.7 g (not 6.5); golden fixtures pin the ratio.

**D3b [M/L][EF] (R8) Veggie portions.** — ✅ DONE `d10168d` (floor) + `098cfdb` (fibre band). Both ⚠ resolved.
- Shipped: `CATEGORY_BOUNDS.VEG` now `[100, 400]` (`src/engine/meal-plan/solver.ts:68`) — floor 100 g kills
  "2 g broccoli / 60 g pomodorini"; **ceiling = 400 (Roberto's "100–400" confirmed, not 500)**. R8 was
  REFRAMED to **fibre-driven**: `fibreRatePer1000` (`src/engine/hydration.ts:34`) yields 10–20 g fibre per
  1000 kcal **inverse to energy** (low kcal → 20 end → more veg), with gram bounds as sanity rails. The
  fibre floor drives the planner (`src/engine/meal-plan/planner.ts:120-125`). Tests: `ef4-tolerance.test.ts`.
- Accept (met): no veg portion < 100 g; fibre band inverse to kcal; goldens green (`ef4-tolerance.test.ts`).

**D3c [S] (R9) Peri-workout intra water + pre/intra space in the meal plan.**
- The peri-workout box partially exists (`src/components/plan/peri-workout-timing-card.tsx`;
  `active-plan-view.tsx:244`). Surface pre + **intra-session water** (Model 1 §1.7: INTRA = water)
  in the plan.
- Accept: pre/intra/post shown with the intra water line; display-only.

### D4 — BMR fallback + manual body-fat (R1) [M][EF] — ✅ DONE `d60350f`

**D4 [M][EF] (R1) Manual BF% + Harris-Benedict fallback (Roberto's method, named).**
- Manual BF% ALREADY has an engine path: `estimateBodyFat` consumes `snapshot.bodyFatPctOverride`
  (`src/engine/body-fat.ts:111-113`, method `"override"`) → `calculateBmr` (Katch-McArdle). Missing
  piece is the **wizard input field** to set it.
- BMR fallback: `src/engine/bmr.ts` is **Katch-McArdle only** (L17-25). Today, with no skinfolds +
  no override, `body-fat.ts:122-130` runs the silent Deurenberg **BMI heuristic** then feeds
  Katch-McArdle. Roberto's explicit ask: use **Harris-Benedict** directly. Add
  `harrisBenedict(weightKg, heightCm, ageYears, sex)` to `bmr.ts`; in the no-body-comp path prefer
  it over the BMI heuristic; surface the method as an assumption (Disclosure-over-polish, NORTHSTAR).
- EF: BMR formula change; goldens required.
- Accept: no measurements → Harris-Benedict BMR (not BMI heuristic); manual BF% flows to
  Katch-McArdle; method visible to the coach; goldens green.

### D5 — Unified day-type + manual-kcal engine change (R14 + R15; absorbs R12 + R11) [XL][EF] — ◐ ENGINE CORE DONE, WIZARD/SEAM/CLEANUP REMAINING

**THE BIG ONE — Roberto SIGNED (`3a6abc3`); engine core shipped (`47f93b0` R15, `bb97583` Model-B targets, handoff `7408530`). Remaining work = the wizard rebuild (B-ui), serialization v3 (B-seam, GATED), and label retirement (B-cleanup) — the full continuation lives in `docs/polish/MODEL-B-HANDOFF.md`. Suite at handoff: 125 files / 1230 pass, tsc 0.**

**D5-design [M] Consequence sign-off before any build.** — ✅ SIGNED `3a6abc3` (`docs/polish/D5-DESIGN-DAY-TYPES.md`)
- New DayType model: **OFF / 1-session / 2-session / 3-session** days only. Author the consequence
  ledger Roberto must sign: retires `refeed`, `deload`, `training_light/medium/intense/double` from
  the `DayType` union (`src/engine/types.ts:20-28`); deletes periodization modes 3–4
  (`periodization-modes.ts:37-66`); prunes `DAY_TYPE_SHORT_LABELS` (review page ~L84-96); drops the
  `deload` branch in `hydration.ts:39`. Energy level **emerges** from the scheduled workouts' per-day
  session TDEE (existing `perDayTrainingSession` path) — refeed/deload params retire because they no
  longer have a home.
- **Gate: PASSED — Roberto signed the retirement list (`3a6abc3`, 2026-07-22).** Day-level rule added:
  ≥250–300 kcal step = higher class; "Media settimanale" survives as a target policy.

**D5a [XL][EF] (R14 + R15) The engine seam — two facets.** — ◐ ENGINE DONE (`47f93b0`, `bb97583`); UI wiring rides B-ui
- Seam: `src/server/routers/plan.ts:452-466` (`intakeTrainingSessions` → `perDayTrainingSession` →
  `engineOptions.perDayTrainingSession`) + the engine's day-TDEE assembly + the DayType model.
  - **Facet R14:** day type = session count; the day's energy emerges from the scheduled sessions'
    expenditure (`ExerciseSession[]`), not a manual tier label.
  - **Facet R15:** a per-session manual kcal (`session.kcal_override`,
    `week-sessions-editor.tsx:34`) **replaces MET when set** — carry it into the `ExerciseSession`
    as `method: "session_estimate", kcalEstimate` in the intake→engine mapping (`plan.ts:455-466`).
    This flips the display-only behaviour.
- **Deliberately update** (not keep green): the invariant at
  `src/server/routers/__tests__/session-kcal-override.test.ts:179-186` ("a kcal override does NOT
  move the plan") is **inverted** — a set override now moves that day's plan. Also update the
  display-only copy at `session-kcal-row.tsx:149` ("Non modifica il calcolo del piano") and the
  comment at `week-sessions-editor.tsx:32-33`.
- **Absorb R12:** the mode-change wipe disappears — day type = session count = the schedule, so no
  template overwrite exists to wipe sessions. Verify sessions persist across a day-type change.
- **Absorb R11 [SHIPPED-verify]:** two sessions/day already works (`WeekSessionsEditor.addSession`,
  L89-95); re-verify through the new model + after the R2 SQL.

**D5b [L] Wizard rebuild.** — ◻ REMAINING (this is B-ui in `MODEL-B-HANDOFF.md` — the testable deliverable; deploy after)
- Replace the four-mode selector (`periodization-modes.ts`) with OFF/1/2/3-session day affordances;
  per-day edit visible (round-1 #6 intent preserved under the new model).
- Accept: golden plan fixtures pass under the new model; setting/clearing a per-session kcal moves
  that day's plan; changing day type preserves entered sessions; the inverted invariant test is
  green; a value-diff oracle covers the seam.

### D6 — Client-side day checker (old D3, renumbered) [L][EF] — ◻ REMAINING (not started)

**D6 [L][EF] (old D3 / round-1 Q3) Day checker.**
- Client-side meal-structure changes/swaps validated against assigned daily targets using the B1
  slot classes (Model 1 §1, shipped); shows the resulting macro state.
- Accept: portal swap validated vs targets; macro delta shown; DB stays macro-value source of truth.

### D7 — Portal experience residuals (old D2, old D4) [M] — ◻ REMAINING (not started)

**D7a [S] (old D2) Weekly-average weight auto-computed + shown** (portal + coach). Not shipped
(no rolling-average surface found). Accept: 7-day average weight rendered on both surfaces.

**D7b [M] (old D4) Portal polish:** dark-theme pass (DIRECTION theme ruling — one token system,
two themes), emoji→icons (DIRECTION §7 bans emoji-as-iconography — 📊✅⚠️ die), a11y basics.
Coordinates with H (i18n) + J (hardening).

---

## Wave E — Fight-week module (Q4) [XL][EF] — ◻ DESIGNED, NOT BUILT (model CONFIRMED `639af04`; build notes `6f4a287`)

Reference: docs/reference/fight-week/ (two real protocols; variance notes in its README).
Principle: the app NEVER computes a cut — only arithmetic (countdowns, rehydration totals from
entered cut at editable 150%/70% coefficients, ÷3 refuel helper).

- **E1** Data model — FightWeekProtocol: athlete, weighInDate (+early/late flag), optional
  fightDate/time, weight-class target, notes; instantiated from a coach-owned template library
  (seeded from both reference docs).
- **E2** DayRow (−7…−1, weigh-in): water (value or min–max mL) · salt g · training label · kcal/P/F/C ·
  optional fibre cap · constraint flags (NO_SALT, LOW_FIBRE, NO_WHOLEGRAIN, NO_VEG, FRESH_FOOD_ONLY) ·
  free-text meal template · conditional notes · **PLANNED WEIGHT kg** (AMENDMENT 2026-07-21:
  first-class, not optional — Roberto authors/edits the per-day weight trajectory ahead of time and
  adjusts any day mid-week) + actual morning-weight log; plan-vs-actual variance visible per day.
- **E3** Weigh-in block: fasted flag, day-before options, cutting-work cycles (15–30' active/passive),
  orthostatic-hypotension safety line (always rendered).
- **E4** RehydrationPlan: total = editable % of cut (default 150), prepared-in-bottles % (default 70),
  timed bolus rows, drink recipe (½-dose electrolyte + 40–60 g/L carbs), ÷3 INS helper (deficit →
  2/3 liquid + 1/3 dense food).
- **E5** RefuelTimeline: phases 0–1h / 1–2h / 2–3h / 3h+ (1.2 g/kg/h), each with content, examples,
  macro ranges; per-24h targets (e.g. P 120–150 / F 50–70 / C 650–800 / fibre <20); per-meal ritual
  (creatine 4–6g + enzymes + ~2g salt shot); fluids ≥1L/h first 4–6h.
- **E6** MatchDayPlan: meal templates with early/late-match variants; final-60' stack; final-5'
  honey/ginger item.
- **E7** Attached protocol blocks (F): fight-week supplements, cramps/TRPA1 + mouth rinse, fight-week
  plant foods, shopping/pharmacy/equipment — referenced, not duplicated.
- **E8** Surfaces: coach grid editor + countdown; portal daily fight-week card flipping to
  rehydration/refuel checklist post-weigh-in; full-protocol PDF export.
- **E9** NOT in v1: no auto-generated cut numbers, no sweat-rate models, no wearables.
- **E10** Build gate: golden render fixtures — BOTH reference docs reproduced through the template
  model without loss before UI work starts.
- **E11** Build notes (line-verified 2026-07-21): engine already has `waterLoadingSchedule`
  (`hydration.ts:88`) + CombatProtocols fibre/sodium caps (`plan-generator.ts:130-137`); bundle carries
  waterLoading, `portal.ts:207` returns it, NO render path exists in portal or PDF yet. PDF slots
  cleanly after day-type pages (`html-renderer.ts:505-586` pattern). RECOMMENDATION: **normalized**
  tables (fight_week_protocol + fight_week_day + template library) — fight week is coach-AUTHORED,
  date-anchored, edited daily; a bundle blob would force regeneration semantics on every edit.
  Existing waterLoading/fibre/sodium engine output stays as-is and links INTO the protocol view.

## Wave F — Protocol blocks (Q5) [L] — ◻ REMAINING (not started)

**F1** Reusable content blocks (cold, heat, supplements, refeed, cutting kit — seeded from Model 1 §2–3)
attachable to plans; rendered in portal + PDF; coach-editable.

## Wave G — Financial dashboard (#17) [L] — ◻ MOCK ONLY, NOT BUILT (branded mock `c96d364`)

**G1** Build per approved mock (docs/polish/concepts/finance-dashboard-mock.html): KPIs, 12-month chart,
per-athlete economics, aging, pricing intelligence, "da fatturare". Cooperation-type segmentation
consumes C1 (shipped). Invoice-derived metrics are complete (all work invoiced through the app).

## Wave H — Internationalization (Q7) [XL] — ◻ NOT STARTED

**H1** i18n framework + string-extraction pattern (built early so new features are translatable);
per-user language (coach + per-client portal).
**H2** Full IT/EN translation pass incl. PDFs/emails.

## Wave I — Data import (Q6) [M][R] — ◻ NOT STARTED

**I1** Import path for last-year clients: minimal fields (anagrafica) via assisted CSV/manual;
optional measurements; recent clients first.

## Wave J — Hardening & release (arc backlog) — ◐ PARTIAL (J2 note `4c7d4d0`; rest remaining)

**J1** Wave B hex→token sweep (remaining coach pages) + theme toggle UI.
**J2** T3.3 async-state primitives; T3.9 a11y (labels, role=tab); charts polish; C3 follow-up:
read-only 'Frequenza check-in' pointer on Monitoraggio linking to the client card (single-writer preserved).
**J3** T1.11 rate limiter; T1.13-fix (pending EF4 from pack).
**J4** Release seal: design re-score, full-suite + live e2e, prod deploy checklist, real-device pass,
updated DEMO-SCRIPT.

---

## PARKED (operator-deferred, not work)

- **MET-value retuning** — the 1,626-kcal question (2 h BJJ + 1 h weights; MET holds for full duration,
  real classes have downtime). R15 (D5) is the structural fix; any MET retune is a post-fix review
  with Roberto. Formula trace: `engine/exercise.ts` + `training-modality.ts`, `kcal = weighted MET ×
  kg × hours × 0.85`.

---

## Coverage — round-2 R1–R16 → new plan ids

| R-id | New id | Status | Disposition (sha) |
|------|--------|--------|-------------------|
| R1 | **D4** | ✅ | Manual BF% override + Harris-Benedict BMR fallback in `bmr.ts` — `d60350f`. |
| R2 | **verify-only** | ◻ | Migrations 023/024 on prod; SQL paste resolves. No code deliverable; verify after SQL. |
| R3 | **D2a** | ✅ | Coach reply UI → `markReviewed` + portal display + `checkin/reviewed` notify — `245eee4`. |
| R4 | **D2b** | ✅ | Review surface shows every answer (all scales + free text) — `245eee4`. |
| R5 | **D3a** | ✅ | Salt = water-L × 1 g/L in `hydration.ts:65` — `d10168d`. |
| R6 | **D1d** | ✅ | `fibreG` surfaced per meal/day — `d4a78df`. |
| R7 | **D1c** | ✅ | Daily macro recap line above each day's meals — `d4a78df`. |
| R8 | **D3b** | ✅ | `VEG` floor 100 (ceiling 400) `d10168d` + fibre-driven band 10–20 g/1000 kcal `098cfdb`. |
| R9 | **D3c** | ✅ | Pre/intra space + intra-session water — `d1d1566`. |
| R10 | **D5a (verify)** | ◐ | Wizard prefill — verify through the B-ui rebuild (pending). |
| R11 | **D5a (absorb)** | ✅/verify | Two sessions/day shipped in B4 `aeaa720`; re-verify through B-ui. |
| R12 | **D5a (absorb)** | ◐ | Mode-change wipe removed by the B-ui rebuild (no template to wipe) — B-ui pending. |
| R13 | **D1a** | ✅ | Durata/RPE column headers on session rows — `d4a78df`. |
| R14 | **D5-design + D5a/D5b** | ✅ signed / ◐ UI | Signed `3a6abc3`; engine `47f93b0`+`bb97583`; B-ui/B-seam/B-cleanup pending. |
| R15 | **D5a** | ✅ engine / ◐ UI | Manual kcal feeds the engine — `47f93b0`; UI wiring rides B-ui. |
| R16 | **D1b** | ✅ | Supplement dedupe: guard add + remove assigned from picker — `d4a78df`. |
| — | **PARKED** | ⏸ | MET-value retuning deferred to post-fix Roberto review. |

## Coverage — prior not-yet-done items (old D–J) → new plan ids

| Old id | Item | New id | Disposition |
|--------|------|--------|-------------|
| old D1 | Check-in adds training-quality/digestion 0–10 | **D2a/D2b** | Schema + portal form already collect these; folded into the R3/R4 review loop. |
| old D2 | Weekly-average weight auto-computed | **D7a** | Not shipped; carried as a portal residual. |
| old D3 | Client-side "day checker" (Q3) | **D6** | Renumbered exactly as flagged; uses B1 slot classes. |
| old D4 | Portal polish (dark theme, emoji→icons, a11y) | **D7b** | Carried; coordinates with H + J. |
| old E | Fight-week module (E1–E11) | **E** | Kept verbatim (letters + content + gates). |
| old F | Protocol blocks | **F** | Kept. |
| old G | Financial dashboard (#17) | **G** | Kept. |
| old H | Internationalization | **H** | Kept. |
| old I | Data import (Q6) | **I** | Kept. |
| old J | Hardening & release | **J** | Kept. |

Every R1–R16 id and every not-yet-done prior item (old D–J) is accounted for above.
Open Roberto inputs: **NONE** — all three prior blockers closed 2026-07-22 (R8 ceiling = 400 `d10168d`;
R8 reframed fibre-driven `098cfdb`; R14 signed `3a6abc3`). Next build = Model-B wizard (B-ui), then E–J.
