# Plan to close out Roberto's feedback

**Date:** 2026-05-15
**Status:** Branch `fix/roberto-feedback-phase0` at 24 commits, overall alignment ~75% (honest scorecard in `SPEC-ANSWERS-2026-05.md` + commit `73f2b76`).

This doc plans the work to take alignment from ~75% to ~92%+. It maps the three remaining gaps (Roberto #2, #3, #9) to three short phases. Items already shipped aren't re-litigated here.

---

## What's left

| # | Roberto's complaint | Current | Target |
|---|---|---|---|
| 1 | Edit goal / routine at plan-generation time (not via edit page) | 80% | 95% |
| 2 | View **and edit** params before generation: goal, routine, day types, activity, calories, macros | 55% | 90% |
| 3 | Day-type structures + multiple protocols + weekly EE table | 30% | 85% |
| 9 | Target-date-driven deficit + aggressiveness + safety floor | 10% | 90% |

#2, #3, #9 converge on the same UI surface: a **"configure plan" wizard** that runs *before* `plan.generate`. #1's remaining gap (changing goal/routine for one plan without overwriting the client's record) folds in naturally.

Pieces that are NOT in this plan:
- **Unit-snapping for food rounding** (1 uovo = 50 g, 1 mela = 150 g, …). Needs the food DB to carry unit-weight tags per ingredient — that's a real Phase 2 piece and benefits from Roberto confirming his unit list first. The 5 g / 1 g rounding from commit `f31b0e3` already covers ~70 % of his "impractical quantities" complaint.
- **Live OCR verification** — depends on a real Vercel deploy with `ANTHROPIC_API_KEY` set and a few real workout-app screenshots.
- **Portal-invite live test** — depends on Supabase admin creds (deploy-only).

---

## Phase A — Target-date deficit calculator (Roberto #9)
~½ day · 1 commit

**Engine.** New pure-TS module `src/engine/goal-rate.ts`:
- `computeGoalRate({currentKg, targetKg, weeks, tdeeKcal, leanMassKg, sex})` → `{requiredKgPerWeek, dailyDeficitKcal, percentBwPerWeek, aggressivenessBand, kcalFloor, withinSafetyFloor, suggestedWeeks?}`.
- Caps: 1.0 %/wk fat loss · 0.5 %/wk muscle gain · floor = EA ≥ 20 kcal/kg lean (override `lean_mass_kg × 22` if EA-derived floor is below it).
- Band: `comfortable | moderate | aggressive | extreme`. Extreme returns `suggestedWeeks` for the same target at the cap.
- Surplus path mirrors deficit with sign flipped.
- ≥ 15 vitest cases.

**Server.** `plan.generate` mutation accepts new optional inputs:
- `goalOverride?: { goal, targetWeightKg, targetEventDate }`
- `deficitOverride?: number` (kcal/day, applied AFTER engine TDEE to derive `weeklyAverageKcal`)
- Both passed through to `plan-generator.generatePlan` via `engineOptions.targetDailyKcalOverride` (new optional field on `PlanOptions`).

**UI.** New "Obiettivo & deficit" card on `/plans/generate/page.tsx`:
- Read goal / target weight / target date from latest snapshot, prefill.
- Live readout (debounced 200 ms): *"Per perdere X kg in Y settimane servono Z g/sett ≈ K kcal/giorno di deficit (W % del peso/sett)."*
- Status badge: Confortevole / Moderato / Aggressivo / Estremo.
- "Suggerimento: estendi a X settimane" when status is Estremo.
- Slider to override the implied deficit (200–800 kcal/day for fat loss; 100–500 for muscle gain).
- Blocks generate-button when daily kcal would fall below the EA floor.

Closes #9 fully. Bumps #2 from 55% → ~70%.

---

## Phase B — Day-type structure + weekly EE table (Roberto #3, parts of #1 + #2)
~1 day · 2 commits

**B.1 — Engine support for explicit week schedule + per-day exercise.**
- Extend `PlanOptions` with `perDayExerciseSession?: Partial<Record<DayType, ExerciseSession>>`.
- `calculateTdee` already accepts `trainingSession` / `deloadSession`; widen so a coach-provided override per day-type wins over the snapshot-derived default.
- Schema is unchanged — `weekSchedule` already accepts all 4 DayTypes (`training | rest | refeed | deload`). The wizard just lets the coach overwrite it.

**B.2 — Server: plan.generate accepts week + day-types.**
- New `weekScheduleOverride?: DayType[]` (length 7) input. When present, used instead of `snapshot.week_schedule`.
- New `plan.previewWeek` query (read-only) that runs the engine with all the wizard's current overrides and returns `{ days[], weeklyAverageKcal, energyBalance, assumptions }` for live preview. No DB write. ~50 ms typical latency.

**B.3 — UI: "Struttura del piano" card with 4 presets + 7-day calendar + EE table.**
- Preset dropdown:
  - *Media settimanale* — collapse to 1 day-type (all `training`)
  - *ON / OFF* — derive from `_intake.training_sessions` (today's default — explicit now)
  - *ON / OFF + Refeed* — `rest` slot → `refeed` on Sunday (or coach reassigns)
  - *Custom* — coach assigns each day from a 4-choice dropdown
- 7-day calendar (Lun–Dom) with the current assignment editable.
- Live "Tabella settimanale" below the calendar, calling `plan.previewWeek` (debounced 300 ms):
  - Columns: Giorno · Tipo · Sessioni del giorno · TDEE stimato · Apporto pianificato · Δ
  - Footer row: media settimanale + status (deficit/maintenance/surplus from Phase A).

Closes #3. Bumps #1 from 80% → 95% (generation-time override path now exists). Bumps #2 from ~70% → ~85%.

---

## Phase C — Macro overrides + final polish (Roberto #2 tail)
~½ day · 1 commit

**Engine.**
- Extend `MacroOptions` with optional absolute-gram overrides:
  `{ proteinG?: number; fatG?: number; carbG?: number }`. When set, bypass the `g/kg`-based calculation and use the values directly.
- Already supports `proteinPerKgLbm` / `fatPerKgBw` — these now coexist with the absolute overrides (absolute wins if both are set).

**Server.**
- `plan.generate` accepts `macroOverrides?: Partial<Record<DayType, MacroOverride>>`. Threaded to the per-day-type macro calculation via `PlanOptions.macroOptions`.

**UI.**
- Collapsible "Macro (avanzato)" card on the wizard:
  - For each unique day-type in the current week schedule, show:
    - Engine-calculated P / F / C / kcal (read-only baseline)
    - Override fields P / F / C in grams
  - "Reset al calcolato" button per day-type
- Per-day EA recomputed below the override fields.

Closes the last piece of #2. Final state: ~90% on each of #2 / #3 / #9.

---

## Phase D — Documentation + final scorecard (no code)
~½ day · 1 commit

- Update `FEEDBACK-RESOLUTION-PLAN-2026-05.md` with a final implementation log + the new scorecard.
- Update `SPEC-ANSWERS-2026-05.md` to mark closed items.
- Update the memory file (`~/.claude/.../project_roberto_scrigna_platform.md`).
- Document deploy actions (now 5 migrations: 002–005, plus the new ones if any).

---

## Honest dependencies and risks

- **No new migrations expected** for Phase A/B/C — all engine + bundle schema changes are JSONB-friendly.
- **The `plan.previewWeek` query** does a synchronous engine run. The engine is pure TS, no DB calls beyond the snapshot fetch, so it's fast (~30–50 ms). Worth a vitest covering the contract.
- **The wizard is 500–800 lines of UI** added to `/plans/generate/page.tsx`. I'll factor it into sub-components (`<GoalDeficitCard>`, `<WeekStructureCard>`, `<MacroOverridesCard>`) so the file stays maintainable.
- **Roberto's pushback on the questions doc** could simplify Phase B (e.g. if he confirms "no refeed/deload presets needed", we drop those branches). Worth waiting for his reply before locking the preset list — but the engine + server pieces are decoupled from the preset choice, so we can ship A and C even without his input.

## Expected final state after Phases A–D

| # | Confidence |
|---|---|
| 1 Edit context | 95% |
| 2 View + edit before generate | 90% |
| 3 Day types + weekly table | 85% |
| 4 Food rounding | 75% (unit-snapping deferred) |
| 5 Adjust + alternatives | 85% |
| 6 Send flow | 75% (deploy-bound) |
| 7 Plan link | 95% |
| 8 Screenshot OCR + SCP | 90% |
| 9 Target-date deficit | 90% |
| 10 Mobile + taxonomy | 85% |
| 11 Portal invite | 75% (deploy-bound) |
| 12 Supplements | 85% |

**Overall: ~87–92%**, primarily limited by items that need real-Vercel deploy verification (#6, #11) and one item deferred (unit-snapping in #4).

---

## Execution order

Phase A → Phase B (B.1 → B.2 → B.3) → Phase C → Phase D. Each phase ships as one or two clean commits, builds + typecheck + tests gated.

Roughly 2–3 focused days of work. Want to start? If yes, I'll begin Phase A (engine `goal-rate.ts` + tests) and report progress at each commit boundary.
