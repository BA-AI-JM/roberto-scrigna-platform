# SCP HR-Zone Expenditure Engine — SHELVED

**Status:** SHELVED (kept, tested, not wired into plan generation). Not deleted.
**Location:** `src/engine/sport-correction/**` — 14 files, 64 passing tests.
**Decision:** keep as a dormant future capability; the plan-generation prescription
path deliberately stays on the simpler MET model (`src/engine/exercise.ts`).

---

## 1. What it is (plain language, for Roberto)

Every plan needs an estimate of **how many calories a training session burns**, so
the diet can be set correctly around it. There are two ways to estimate that:

- **The simple way we use today (MET model):** "this activity is worth ~X MET,
  you did it for Y minutes at bodyweight Z → about N calories." Fast, needs only
  *modality + duration + effort (RPE)*. This is what actually drives every plan.

- **The precise way SCP was built for (HR-zone model):** if we have the athlete's
  **heart-rate zone breakdown** for the session (how many minutes in Zone 1, 2, 3,
  4, 5 — the kind of data a Garmin/Polar/Whoop screenshot shows), SCP computes a
  much more individualised burn: it trims "watch-left-on" tail time, weights each
  zone by intensity, applies a strength-training correction, and even sanity-checks
  against the calories the *device itself* reported. It returns not just a number
  but an **uncertainty range** (e.g. "480–540 kcal").

SCP is the **"if we had a wearable, here's the accurate number"** engine. It is
complete and tested.

## 2. Why we're not using it (in one line)

**We don't have reliable HR-zone data flowing into plan generation, and the plan
engine reads its training data from the intake form, not from wearables.** SCP
needs per-zone minutes to run; the intake form only captures *modality / duration /
RPE*, which is exactly what the simple MET model needs. So the accurate engine has
nothing to eat, and the plan path never calls it.

---

## 3. How it works (technical — the 11-stage pipeline)

Entry point: `runSCP(input: SCPInput): SCPResult | null` (`sport-correction/index.ts`).
Returns `null` for anything below "Tier 1" data (i.e. no HR zones), signalling the
caller to fall back to the legacy MET/Keytel path.

**Input** (`SCPInput`): `{ hrZoneData?, categoryId, sessionType, durationMin,
weightKg, ageYears, sex, deviceKcal? }` — the crux is `hrZoneData`
(`minutesPerZone: [belowZ1, Z1…Z5]`, `avgHeartRate`, `totalRecordedMin`).

| Stage | File | What it computes |
|---|---|---|
| 0 Data-quality tier | `stage0-tier` | Tier 1 = HR zones present → run. **Tier 2 (avg HR only) / Tier 3 (RPE/MET only) → return `null`** (caller uses MET/Keytel). |
| 1 Extract zones | `stage1-extract` | Parse + validate `HRZoneData`, surface zone-total discrepancies. |
| 2 Tail cutoff | `stage2-cutoff` | Exclude "watch-left-on" tail time (a sustained below-Z1 block after the session). |
| 3 Active duration | `stage3-active` | Real active minutes after tail exclusion. |
| 6 MET assignment | `stage6-met` | Net MET per zone from the sport profile (`CATEGORY_PROFILE`). |
| 4 Below-Z1 class. | `stage4-below-z1` | Decompose below-Z1 time (matters for strength). |
| 5 Z1 character | `stage5-z1-char` | Strength Z1 ≠ cardio Z1 (metabolically different). |
| 7 Efficiency E | `stage7-efficiency` | Efficiency factor that scales the per-minute HR-model kcal. |
| 8 EEE | `stage8-eee` | Per-zone kcal via the ACSM constant `(3.5 × weightKg)/200`. |
| 6b Benchmark | `stage6b-benchmark` | Mechanical-density recalibration (the critical STRENGTH sanity stage). |
| 9 Uncertainty range | `stage9-range` | Propagate uncertainty → a low/high kcal range. |
| 10 Device compare | `stage10-device` | Compare protocol vs `deviceKcal` (wearable), when supplied. |

**Output** (`SCPResult`): `{ exerciseKcal, totalEEEKcal, activeDurationMin,
kcalRange, deviceComparison?, recalibrationFactor: 1.0 }`. Note `exerciseKcal` is
`ExerciseResult`-compatible, and **`recalibrationFactor` is `1.0`** — SCP does its
own calibration, so it deliberately **bypasses the 0.85 factor** the MET path applies.

**vs the MET path (`exercise.ts`):** MET does `MET × kg × hours × 0.85` from a
single modality+RPE. SCP does a per-HR-zone, tail-trimmed, efficiency- and
benchmark-corrected sum with an uncertainty range — far richer, but it needs the
zone data the MET path doesn't.

---

## 4. Why it's INERT (concrete dead-linkage trace)

There are **two** distinct SCP hooks. Neither reaches a plan/prescription:

**(a) The generation hook — never populated.**
`calculateExercise` (`exercise.ts:93`) runs SCP **only when `session.scpData != null`** (Method 0). But the generation path builds its exercise sessions via
`buildTrainingSessionFromIntake` / `buildTrainingSessionForDay`
(`training-modality.ts:135,161`), which return `{ method: "met_value", durationMin,
metValue }` — **no `scpData`**. A repo-wide search for anything writing `scpData:`
returns **nothing** outside tests/types. So inside plan generation, SCP's Method-0
branch is unreachable dead code — generation always takes the MET path.

**(b) The training-log hook — live-ish, but display-only.**
`runSCP` *is* actually called in one reachable place: `trainingLog.create`
(`training-log.ts:387`). When a coach uploads a training **screenshot**, the OCR
(`extractExercisesFromScreenshot`, a real Claude-Vision call) can extract per-zone
minutes (`hr_zone_minutes`), and if a modality resolves, SCP computes a burn →
stored on **`training_log.kcal_calculated`** (a display/analytics column on that
logged session). **But plan generation never reads `training_log`** (confirmed:
zero `from("training_log")` in `plan.ts` / `plan-generator.ts` / `engine/**`), so
even when SCP fires here, its number can **never** influence a diet or prescription.

> **Correction to earlier notes:** a prior sweep called SCP's only entry the
> "uncalled `processScreenshot` stub." That was inaccurate on two counts: SCP's real
> call site is `trainingLog.create`'s OCR path (which *is* UI-wired, via the coach
> training page), and `processScreenshot` is a *separate* thin OCR endpoint (real,
> not an unimplemented stub) that happens to have **0 callers**. The accurate
> summary is: **SCP never drives plan generation; at most it colours a logged
> session's displayed kcal.**

---

## 5. What activation would take (the dormant → live gap)

To make SCP actually drive **plan generation** you would need to close three gaps:

1. **A source of HR-zone data at prescription time.** Options:
   - **Wearable integration** (Garmin/Polar/Apple/Whoop API) → per-session zone minutes. Biggest lift; most reliable.
   - **Manual entry** in the intake/training UI (coach types zone minutes). Cheap; low adoption/accuracy.
   - **The existing OCR path** (screenshot → `hr_zone_minutes`) as the feeder — already half-built in `trainingLog.create`.
2. **Populate `ExerciseSession.scpData`** on the generation input. Today
   `buildTrainingSession*` emit `met_value` only. They'd need to attach
   `{ scpData: { hrZoneData, categoryId, sessionType, deviceKcal? } }` **when zone
   data exists** for the client's representative session — at which point
   `calculateExercise` Method 0 already routes to SCP automatically (that wiring is done).
3. **Decide how per-session wearable data becomes the "representative" training day.**
   Generation currently models one representative training session from intake; SCP
   is per-session. You'd need an aggregation rule (e.g. average recent sessions'
   zone profiles) to feed a single representative `scpData`.

Good news: the **hard part (the engine + the Method-0 routing) is done and tested.**
Activation is a *data-plumbing* problem, not an engine problem.

---

## 6. Honest assessment

- **Complete, not partial.** 14 stages, 64 passing tests (BJJ/hypertrophy/edge-case/
  pipeline suites). The pipeline runs end-to-end and returns calibrated results + ranges.
- **Viable future capability, not abandoned scaffolding.** It's a genuine accuracy
  upgrade that becomes valuable the moment reliable HR-zone data exists (wearables).
- **Correctly shelved for now.** For a nutrition MVP where inputs are a paper-style
  intake (modality/duration/RPE), the MET model is the right, sufficient, lower-risk
  choice. Wiring SCP into generation now would add a data dependency we can't yet
  satisfy and risk producing under-fed ranges from missing/partial zone data.
- **Recommendation: KEEP (activate later).** Do **not** delete — the cost to carry
  it is ~zero (it's inert in generation and fully tested), and re-deriving it later
  would be expensive. Revisit if/when a wearable integration lands.

---

## 7. Also shelved — OCR training-screenshot endpoint (`processScreenshot`)

- **What it was for:** `training-log.processScreenshot` (a `protectedProcedure`) is a
  standalone endpoint that runs the Claude-Vision OCR (`extractExercisesFromScreenshot`)
  on a training screenshot and returns the parsed workout fields.
- **State:** **0 callers** across all of `src`. It is a *functional* thin wrapper (not
  an unimplemented stub), but nothing invokes it — the OCR that IS live runs *inline*
  inside `trainingLog.create`, not via this endpoint.
- **Relationship to SCP:** the inline OCR in `create` is the (display-only) feeder for
  SCP's training-log call site. `processScreenshot` itself does **not** call SCP.
- **Decision:** SHELVED pending a roadmap decision (e.g. a dedicated "scan my
  training screenshot" UX). Kept, not deleted.

---

*This document archives a deliberate product decision so it is recorded and
reversible. Nothing here was deleted; SCP and `processScreenshot` remain in the
tree, inert with respect to plan generation.*
