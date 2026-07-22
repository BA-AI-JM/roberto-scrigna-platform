# Model B (D5 / R14+R15) — build continuation handoff

For a fresh terminal picking up the day-type rebuild. Branch `polish/audit-arc-2026-07`.
Full design + rationale: `docs/polish/D5-DESIGN-DAY-TYPES.md` (SIGNED by Roberto)
and `docs/polish/PLAN-2026-07-21-PRODUCT-COMPLETION.md` §E-B. Layman explainer of
the model is in the session history; the one-line version: **the engine measures
each day's expenditure, Roberto designates each day and can set its calorie
target above what it burned (a refeed); carbs absorb any surplus for free.**

## DONE + pushed (engine core, proven)

- **B-eng1 / R15** (`47f93b0`) — manual per-session kcal feeds expenditure.
  `IntakeTrainingSession.kcal_override` → the intake builders
  (`src/services/training-modality.ts`) emit `ExerciseSession.finalExerciseKcal`
  when bodyweight is known; `calculateExercise` (`src/engine/exercise.ts`) uses it
  **directly, bypassing the ×0.85 recalibration** (his 240 stays 240 — the
  double-count trap). MET-only flows byte-identical. All 6 builder call sites in
  `plan.ts`/`client.ts` thread `snapshot.weightKg`. Tests:
  `src/services/__tests__/r15-manual-kcal.test.ts`.
- **B-eng2 / Model B targets** (`bb97583`) — `generateWeeklyPlan`
  (`src/engine/index.ts`) resolves each day's target in two passes: per-day
  override (wins; may exceed expenditure) > `weekly_average` (mean − goal) >
  own expenditure − goal (classic, unchanged). New `PlanOptions`:
  `periodizationStrategy`, `perDayTargetKcalOverride[]`, `perDayLevel[]`,
  internal `targetKcalOverride`. **Surplus is carb-led for free** — protein=LBM,
  fat=BW are body-fixed, carbs are the remainder (+600 kcal ⇒ +150 g C, tested).
  Default output byte-identical. Tests:
  `src/engine/__tests__/model-b-targets.test.ts`.

Suite at handoff: 125 files / 1230 pass, tsc 0.

## REMAINING

### B-ui — the wizard "Struttura settimana" rebuild (the testable deliverable)
- `src/app/(dashboard)/plans/generate/page.tsx` + `src/components/plan-wizard/cards.tsx`:
  remove the mode cards + tier day-type dropdowns
  (`src/components/plan/periodization-modes.ts` + `periodization-mode-selector.tsx`
  retire). New UI: a **strategy toggle** (Media settimanale / Differenziata); in
  Differenziata each day row shows **expenditure read-only** · **livello dropdown**
  (OFF/leggero/medio/pesante) · **apporto target kcal** (defaults from
  expenditure±goal, editable, may exceed expenditure).
- Server: extend `generatePlanSchema` in `src/server/routers/plan.ts` with
  `periodizationStrategy`, `perDayTargetKcalOverride`, `perDayLevel`; pass into
  `engineOptions`. The engine already consumes them — this is pure plumbing.
- The 200–400 kcal weekly spread shows as *guidance* by the toggle, never
  auto-deciding (Roberto designates — see D5-DESIGN).
- Absorbs R12 (no template to wipe the schedule) and R11 (verify 2-sessions/day
  in the new flow). Deploy after this — it's immediately useful.

### B-seam — serialization v3 (GATED, the risk)
- Plan bundle groups by day-TYPE today; two training days can now differ, so
  grouping becomes per-day. Bump `PLAN_BUNDLE_SCHEMA_VERSION` → 3
  (`src/lib/plan-bundle.ts` + `src/services/plan-generator.ts`); the decoder MUST
  still read v1/v2 unchanged.
- Adapters: `src/app/(dashboard)/plans/[id]/review/page.tsx` (dayTypePlans → per-day),
  `src/components/portal/active-plan-view.tsx`, `src/pdf/html-renderer.ts`.
- **Value-equivalence gate (RED→GREEN):** an unchanged ON/OFF week yields
  byte-identical targets AND actuals before/after v3 — only grouping moves. This
  is the NORTHSTAR-frozen seam; hold it behind this proof, exactly as the wizard
  rebuild was.

### B-cleanup — retire labels
- Remove refeed/deload/tier day-types from selectable vocabularies
  (`src/components/plan-wizard/constants.ts`); `src/engine/types.ts` + `macros.ts`
  keep the enum values READABLE so legacy plans decode.

## Gotchas (learned this session)
- **Double-recalibration**: manual kcal is the real burn — never ×0.85 it. `finalExerciseKcal` bypasses; a raw `kcalEstimate` does NOT.
- **Turbopack CSS cache**: a globals.css/@theme change can serve stale through a restart AND a partial `.next` delete — only `rm -rf .next` clears it; curl `/_next/static/*.css` to confirm before rendering.
- **No DB migration** anywhere in Model B — day data lives in JSON + `TEXT[]`.
- **MET values are the input to expenditure** — see the parked MET review (below); R15's override is the escape hatch when a MET estimate is off.

## Verification
`bunx tsc --noEmit` 0; `bunx vitest run` green (rewrite pins to the new truth,
don't delete); a stored schemaVersion-2 plan (Niccolò `793a9bac`) still renders;
live wizard smoke (localhost:3001, roberto@test.com) — build a differentiated
week, override a rest day above its expenditure, generate, confirm the surplus
day is carb-led on review.
