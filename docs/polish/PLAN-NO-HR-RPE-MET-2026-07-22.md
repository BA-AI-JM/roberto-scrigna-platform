# PLAN — No-HR Session RPE-MET expenditure model (v1.0)

**Date:** 2026-07-22 · **Branch:** `polish/audit-arc-2026-07`
**Source of truth:** Roberto's spec `NO_HR_SESSION_RPE_MET_TECHNICAL_SPEC_V1_0.txt`
(internal version id `NO_HR_SESSION_RPE_MET_V1_0`).
**Supersedes:** the parked "MET-value retune" and the density-factor proposal —
Roberto's RPE→curve model replaces both.
**Relationship to Model B:** Model B is unchanged; it consumes whatever expenditure
the engine reports. This plan changes *how* that expenditure is computed. Roberto's
day-designations and target overrides (Model B) sit on top untouched. R15 manual
per-session override is preserved as the escape hatch.

---

## BUILD STATUS — 2026-07-23 · ✅ DEPLOYED (read this FIRST if picking up)

**LIVE in production. `main` @ `3fa3252` on the agentarmy72-del fork; Vercel build
Ready (58s). scrignanutrition.app serves the new model.** Deployed 2026-07-23 after
Roberto live-validated it (whole-session RPE confirmed, plan generation confirmed).
`bunx tsc --noEmit` → 0 · `bunx vitest run` → 1279 pass. The gate is the acceptance
suite `src/engine/__tests__/no-hr-rpe-met.acceptance.test.ts` (Roberto's §15 numbers).

### DONE (commit SHAs)
- **Phase 0** `32e82c7` — the 15 RPE→MET curves + `sessionMet`/interpolation in
  `src/engine/session-met-curves.ts`; §15 acceptance + invariants.
- **Phase 1** `b197241` — `effectiveMet` (`src/services/training-modality.ts`) reads
  the curve via `curveKeyForEntry` (`src/engine/sport-taxonomy.ts`); `rpeFactor`
  deleted; `exercise.ts` drops the ×0.85 on `met_value` ONLY (HR/estimate/default
  keep it — Ruling 3); the badge (`src/lib/training-kcal/estimate-session-kcal.ts`)
  + `dayFinalKcal` also drop 0.85.
- **Phase 2** `72822c2` + `a08b559` — collapsed sport picker (one entry per sport:
  `collapsedSportOptions`/`groupedCollapsedSportOptions`/`toCollapsedModality`) +
  whole-session RPE wording (`RPE_SESSION_SCALE_IT`/`_QUESTION_IT`, spec §6), wired
  into `WeekSessionsEditor` + `IntakeForm`.
- **Golden** `f3da0f0` — full-plan end-to-end fidelity
  (`src/__tests__/fidelity/no-hr-curve-plan.test.ts`): BJJ RPE7 82kg → 394 exercise →
  TDEE 2766 → P172/F74/C353.
- **Cleanup** `1cacbc4` — removed 2 unused spec helpers (`resolveCurveKey`, 4-arg
  `estimateSessionKcal`); the app never called them (drift removal).
- **Tests** `b58ffd3` — range-sanity, interpolation-midpoint, Ruling-3 (0.85) property.
- **Time-field fix** `3fa3252` — Ora fine is derived from start + duration
  (`src/lib/training/derive-end-time.ts`), read-only; an empty time never reaches the
  server (fixes the "invalid value" save). Applied to `IntakeForm` + `WeekSessionsEditor`.
- **Deploy** — `main` fast-forwarded `bb97583..3fa3252`; Vercel production build Ready.

### REMAINING
- **Phase 3 — recompute past clients: CANCELLED** (Roberto ruling 2026-07-22, revised).
  Decision is **forward-only**: existing plans stay frozen (STORED bundles in
  `daily_targets.plan_bundle`); only NEW plan generations use the new curves — which is
  the shipped default, so NO migration is needed. An existing client moves to the new
  numbers only when their coach next generates a plan. This removed the biggest
  remaining piece.
- **Phase 4 — display note** (optional; spec §13 "recommended"). The estimate already
  displays honestly ("stimato"); the "average demand of the whole session" note is
  transparency polish. Build or skip per operator.
- **Phase 2 wizard consumers** — `plans/generate/page.tsx` + `plan-wizard/cards.tsx`
  still use the full `groupedSportOptions()`; they collapse during Model B **B-ui**
  (see `MODEL-B-HANDOFF.md`), not here. `monitoring/training` was deliberately NOT
  collapsed (actuals log, out of model scope).

### OPEN DECISIONS — all resolved
- **RPE-wording DISCONFIRM: CLOSED** — Roberto confirmed (2026-07-22) he reads RPE as
  whole-session demand, matching the curves. Live-validated on screen.
- **Recompute boundary: moot** — recompute cancelled (forward-only, above).

### GOTCHAS
- The ×0.85 lived in THREE places (`exercise.ts`, `estimate-session-kcal.ts`,
  `training-modality` `dayFinalKcal`) — all handled. Keytel HR keeps its 0.85
  (Ruling 3); its test is the regression proof.
- The picker collapse is DISPLAY-ONLY and proven calorie-safe (every sub-type under a
  collapsed sport shares one curve — `collapsed-sports.test.ts`). The full taxonomy
  stays intact for the HR-path sessionType.
- MET-only flows changed BY DESIGN (this is a value change): combat ~−50%, strength
  +18%, cardio ±15%. The gate is "matches Roberto's §15", NOT "byte-identical".
- DEPLOYED 2026-07-23 via `fork` (agentarmy72-del) `main` → Vercel (auto-deploy on
  `main`). The `main` push is gated by the auto-mode classifier — a human runs it with
  `! git push fork <branch>:main`. Rollback: `push fork bb97583:main --force-with-lease`.
- Known separate issue: Vercel **Preview** builds have been erroring for 2+ days
  (Production is healthy) — likely a missing preview-env var; unrelated to this model.

---

## 1. The model (what we're building)

For a session with **no heart-rate trace**: RPE reads a **session-average effective
MET** off a per-sport curve, then

```
estimated_session_kcal = session_MET × body_mass_kg × (duration_minutes / 60)   → round
```

The MET value already contains warm-up, instruction, drilling, rest, equipment
changes and the short high-intensity phase — averaged over the whole clock. RPE is
the **selector** (1–10 walks up the curve), not a multiplier.

**Removed on this path:** nominal peak MET, the RPE multiplier (`0.8+0.04·rpe`), the
`×0.85` recalibration, net-MET subtraction, EPOC, efficiency factor, post-lookup caps,
primary/secondary estimates.

**Three exceptions (spec §5/§7/§16):**
- **Strength & hypertrophy** = flat **3.0** at every RPE (RPE recorded for load
  monitoring, never used for kcal).
- **Combat Sambo** → uses the **MMA** curve. Sport Sambo keeps its own.
- **Cyclic cardio** is **not capped** at 6 MET (climbs to 11.0 at RPE 10).

**Heart-rate path is untouched** (Ruling 3): SCP (Method 0) and Keytel (Method 1)
keep their current math. This model is only the no-HR branch. HR gets its own pass
later, separately.

---

## 2. Decisions locked (Roberto, 2026-07-22)

| # | Decision | Build consequence |
|---|---|---|
| 1 | **Retire the session-type sub-menu** | One display entry per sport; RPE carries Classe-vs-Sparring. **Keep** `categoryId`/`sessionType`/`profile` on each sport — the HR path still needs them, so the collapse is display-only, not a delete. |
| 2 | **Recompute past clients too** | Regenerate active clients' plans through the new engine (inputs unchanged, outputs recomputed), stamped `recalculated_on`. Boundary (active roster vs archived sent-PDFs) confirmed with operator in Phase 3. |
| 3 | **HR-monitor clients unchanged** | Drop `×0.85` on the no-HR MET path **only**. SCP/Keytel byte-identical. |
| 4 | **Team/racquet one curve each** | Accept lost per-sport distinction for v1 (spec §18 defers the split). |

---

## 3. Phases (each ends on a hard gate)

### Phase 0 — Curve data + acceptance harness *(pure groundwork, no user-visible change, no deploy)*
- **New file** `src/engine/session-met-curves.ts`: the 15 RPE→MET curves,
  **transcribed verbatim from spec §8** (the JSON block), typed as
  `Record<CurveKey, Record<1..10, number>>`. Curve keys per spec §8:
  bjj · wrestling · judo · sport_sambo · boxing · muay_thai · kickboxing · karate ·
  taekwondo · mma · strength_hypertrophy · hiit_functional · cyclic_cardio ·
  team_sports · racquet_sports. `combat_sambo` maps to `mma`.
- `sessionMet(curveKey, rpe)`: integer lookup; **linear interpolation** for decimal
  RPE (spec §9). `strength_hypertrophy` short-circuits to 3.0.
- **RED first:** encode Roberto's **§15 acceptance tests (all 10)** as a golden test
  `src/engine/__tests__/no-hr-rpe-met.acceptance.test.ts` — 369 / 394 / 350 / 492 /
  308 / 308 / 289 / 560 / 416 / 431. This is the gate for the whole plan.
- **GATE:** all 10 acceptance tests pass to the exact kcal.

### Phase 1 — Wire curves into the calculation *(the value swap)*
- **Pre-edit:** `gitnexus_impact({target:"effectiveMet"})` and `calculateExercise`,
  `rpeFactor` — report blast radius (repo CLAUDE.md MUST).
- `src/services/training-modality.ts:89-100`: delete `rpeFactor`; rewrite
  `effectiveMet` to call `sessionMet(curveKeyFor(entry), rpe)`. Day-summing
  (`metMinSum` at :132/:172/:210) stays — each session now sources its MET from the
  curve.
- `src/engine/exercise.ts:22,134-162`: on the MET path, return
  `sessionMet × kg × hours` with **no `×0.85`**. Leave Method 0 (SCP :93-117),
  Method 1 (Keytel), and the R15 `finalExerciseKcal` bypass (:122-128) exactly as-is.
  Add method label `NO_HR_SESSION_RPE_MET`.
- **GATE:** acceptance tests green end-to-end through `calculateExercise`;
  SCP/Keytel/R15 tests **unchanged** (proves HR path byte-identical);
  `session-kcal-override.test.ts` still green (guards the logged-workout column,
  different layer); strength returns 3.0 flat.

### Phase 2 — Taxonomy collapse + RPE question rewording *(ships with Phase 1 as one coherent change)*
- `src/engine/sport-taxonomy.ts`: collapse the display list to **one entry per
  sport** (drop the Classe/Sparring/Drill/OpenMat/Gara variants from the picker);
  **keep** `categoryId`/`sessionType`/`profile` (a sensible default sessionType per
  sport for the HR path). Add a `curveKey` to each entry.
- **Legacy mapping:** old modality strings ("BJJ — Sparring", "Corsa — Costante", …)
  must still resolve — map them to their parent `curveKey` in `findSportEntry`
  (:130) so stored snapshots never break. `FALLBACK_MODALITY` (:136) →
  the explicit **"other"** workflow (spec §10): ask for closest category, never
  silently default an unknown sport to a combat curve.
- **Intake UI** *(locate at build: the RPE selector in the training-routine/intake
  form — grep `rpe` in `src/app/**` + `src/components/**`)*: reword the question to
  **"Quanto è stata impegnativa l'intera sessione, incluse pause e recupero?"**
  (whole-session, not peak — spec §4) and update the 1–10 scale descriptions
  (spec §6).
- **GATE:** old snapshot resolves to a curve (test a legacy modality string);
  a stored schemaVersion-2 plan still renders; picker shows the collapsed list;
  RPE question reads whole-session.

### Phase 3 — Recompute past clients *(operator-gated migration, Ruling 2)*
- **Regenerate active clients' plans** through the new engine — inputs (logged
  modality/RPE/duration) unchanged, expenditure + targets recomputed. Stamp each
  regenerated plan `recalculated_on: 2026-07-…`.
- **Boundary confirmed with operator here:** recompute *active roster only*
  (recommended) vs *also rewrite archived sent-PDF snapshots* (historical record —
  usually left alone). Answer changes the migration's reach, not the model.
- Backup the affected plan rows before the run; the pass must be **idempotent** and
  **reversible**.
- **GATE:** a hand-picked real client's regenerated numbers match hand-computed curve
  values; **athlete-safety floor check** — no active plan drops below the goal-rate
  floor after recompute (lower expenditure must not silently under-fuel a cutting
  athlete); rollback rehearsed.

### Phase 4 — Display + labels *(rides with 1+2 or just after)*
- Result label **"Stima del dispendio energetico della sessione: XXX kcal"**;
  optional secondary line **"MET medio effettivo di sessione: X.X"**; the explanatory
  note (spec §13) that it's the average demand of the whole session, not continuous
  competition. Surface `NO_HR_SESSION_RPE_MET` where the calc method is shown.
  Never label as device/exact/lab calories (spec §13).
- **GATE:** review page, plan PDF, and portal show the new label + note.

---

## 4. The value gate (this is not a byte-identical change)

Our refactors gated on "numbers stay identical." This is a **deliberate value
change**, so the gate flips: **the engine must reproduce Roberto's §15 acceptance
tests to the exact kcal.** His 10 cases become the permanent regression suite — any
future taxonomy/curve edit is checked against his own published expected outputs
(spec §18: never modify curve values silently; bump the version).

---

## 5. Cross-cutting

- **Blast radius:** every combat-sport plan drops ~45–62%; strength +18% (0.85 gone);
  cardio ±15%. Many existing fixtures speak the old MET numbers — **rewrite the pins
  to the new truth, do not delete them.** Expect large fixture churn; that's the
  intended signal, not a regression.
- **Model B:** consumes the new (lower) expenditure unchanged. Verify a differentiated
  Model B week still generates and the surplus day is still carb-led.
- **HR-path invariance (Ruling 3):** the SCP/Keytel test suites are the proof the HR
  branch didn't move — they must stay green with zero edits.
- **R15:** manual override still bypasses everything — now rarely needed because the
  defaults are conservative.

---

## 6. Verification / acceptance criteria

- [ ] Roberto's 10 §15 acceptance tests green (the gate).
- [ ] `bunx tsc --noEmit` 0.
- [ ] `bunx vitest run` green (fixtures rewritten to new truth).
- [ ] SCP / Keytel / R15 / session-kcal-override suites **unchanged** (HR-path + layer proof).
- [ ] A stored schemaVersion-2 plan (Niccolò `793a9bac`) still renders on review/portal/PDF.
- [ ] Live smoke (localhost:3001, roberto@test.com): log BJJ 82 kg / 90 min / RPE 6 → ~369 kcal; strength → 3.0 flat; a cyclic session exceeds 6 MET at high RPE.
- [ ] Model B differentiated week still generates; carb-led surplus intact.
- [ ] Phase 3: floor check passes — no active plan under-fuels post-recompute.

---

## 7. Sequencing + deploy points

- **Phase 0** — groundwork, no deploy.
- **Phases 1 + 2 + 4 ship together** — new numbers, collapsed picker, and the
  whole-session RPE question must land as ONE coherent change (shipping new curves
  with the old "hardest part" question would feed wrong-meaning RPE into the table).
  One deploy.
- **Phase 3 (recompute)** — separate, operator-gated migration after the calc is live,
  with backup + rehearsed rollback, same paste discipline as other prod migrations.

---

## 8. Rollback

- Phases 0–2/4 are code — `git revert` the range; no schema change on this path.
- Phase 3 recompute: restore the backed-up plan rows; regeneration is deterministic,
  so a re-run reproduces state. No prod data mutated outside the plan rows.

---

## 9. Open items — confirm at build start, not blocking the plan

1. **Decimal RPE:** spec §9 prefers integer for v1. **Recommend integer-only at
   launch** (interpolation built but RPE input constrained to 1–10 integers); decimal
   as a v1.1 toggle.
2. **Recompute reach** (Ruling 2 boundary): active roster only vs also archived
   sent-PDFs — Phase 3 gate.
3. **DISCONFIRM to clear:** confirm the testing that "preferred this approach" used the
   **whole-session** RPE wording, not the old "hardest part" prompt — the curve values
   assume the whole-session meaning.

---

*Built to be picked up cold. Ground truth: Roberto's spec file (§7/§8 curves, §15
tests, §16 rationale). Engine files verified this session: `sport-taxonomy.ts`,
`training-modality.ts`, `exercise.ts`, `types.ts`.*
