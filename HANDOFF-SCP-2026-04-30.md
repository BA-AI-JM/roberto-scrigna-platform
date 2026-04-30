# Sport Correction Protocol — Build Handoff

**Date:** 2026-04-30
**Branch:** `feat/sport-correction-protocol`
**Head:** `d7ad085`
**Base:** `main` @ `6d08a52` (includes all platform healing work)
**Tests:** 59 SCP-specific (193 assertions) + 320 existing = 379/383 pass
**Build:** ✅ Green (all 24 routes)

---

## What This Is

Roberto's **core IP** — a 10-stage pipeline that calculates exercise energy
expenditure (EEE) from heart rate zone data, replacing the generic Keytel HR
formula with sport-specific correction for strength training, combat sports, and
endurance work.

The protocol corrects two fundamental problems with wearable kcal estimates:

1. **HR–VO₂ decoupling** — during strength training, HR is elevated by
   sympathetic drive (bracing, Valsalva, CNS activation), not metabolic demand.
   Wearables read high HR and overestimate kcal by 2–3×.

2. **HR-model underestimation** — the inverse problem. When a 65-minute
   hypertrophy session spends 70% of its time below Z2, the HR model produces
   128 kcal — physiologically implausible for compound resistance work. Stage 6b
   corrects this with an ACSM benchmark cross-check.

---

## Architecture

```
src/engine/sport-correction/
├── types.ts             — 280 lines — Full two-level taxonomy (8 categories, 3 profiles)
├── stage0-tier.ts       —  57 lines — Data quality routing (Tier 1/2/3)
├── stage1-extract.ts    —  37 lines — HR zone data extraction + validation
├── stage2-cutoff.ts     — 125 lines — Tail artifact exclusion (Group A/B heuristics)
├── stage3-active.ts     —  23 lines — Active duration = total − tail
├── stage4-below-z1.ts   —  81 lines — Warm-up (Option C, MET 1.0) vs rest (Option D, MET 0.4)
├── stage5-z1-char.ts    —  56 lines — Standing (−0.3 net MET) vs moving Z1
├── stage6-met.ts        — 186 lines — Profile G/L/CYCLIC with STRENGTH override
├── stage6b-benchmark.ts — 176 lines — Midpoint blend with ACSM benchmark (KEY STAGE)
├── stage7-efficiency.ts — 102 lines — Efficiency factor E (formula + table hybrid)
├── stage8-eee.ts        — 150 lines — Per-zone EEE summation
├── stage9-range.ts      — 149 lines — Uncertainty propagation (±E, ±MET)
├── stage10-device.ts    —  42 lines — Device correction factor
├── index.ts             — 174 lines — Pipeline orchestrator
└── __tests__/
    ├── bjj-mixed.test.ts     — Spec A.5 fidelity (final: 342 kcal)
    ├── hypertrophy.test.ts   — Spec A.7 fidelity (final: 155 kcal)
    └── edge-cases.test.ts    — CYCLIC, zero zones, all 8 categories, triggers
```

**Integration:** `exercise.ts` calls `runSCP()` as Method 0 when `session.scpData`
is present. If SCP returns null (Tier 2/3 data), the existing Keytel path runs
unchanged. SCP results carry `recalibrationFactor: 1.0` — the 0.85 blanket
correction is NOT applied because SCP does its own sport-specific correction.

---

## Spec Compliance

### Sport Taxonomy (Spec §2)

| Category | Profile | Session Types | Z1 Character |
|----------|---------|---------------|--------------|
| GRAPPLING | G | mixed, drilling, sparring, competition | Moving |
| STRIKING | L | bag_work, pad_work, sparring, technique | Moving |
| MMA | G | mixed, sparring, competition | Moving |
| **STRENGTH** | **G** | hypertrophy, strength, power, circuit, deload | **Standing** |
| HIIT | L | tabata, amrap, emom, general | Moving |
| CYCLIC | CYCLIC | easy, tempo, interval, race | Moving |
| TEAM | L | training, match, conditioning | Moving |
| RACKET | L | training, match, drilling | Moving |

### MET Values (Spec §6)

**Profile G** (gross − 1.0): Z1m=1.3, Z1s=1.0, Z2=3.5, Z3=6.0, Z4=7.0, Z5=7.5
**Profile L** (gross − 0.5): Z1m=1.8, Z1s=1.5, Z2=4.0, Z3=6.5, Z4=8.5, Z5=9.0
**CYCLIC** (no subtraction): Z1=2.3, Z2=4.5, Z3=7.0, Z4=8.5, Z5=10.0
**STRENGTH override**: Z3–Z5 capped at 6.0 gross → 5.0 net

### Stage 6b — Benchmark (Spec §6b)

| Parameter | Spec Value | Code Value |
|-----------|-----------|------------|
| Blend rule | Midpoint: (HR + bench) / 2 | ✅ `BLEND_BENCHMARK = 0.5` |
| E applied to benchmark | Yes (A.7 confirms) | ✅ Line 128 |
| Conventional MET gross | 3.5 | ✅ |
| Circuit MET gross | 5.0 | ✅ |
| Trigger: duration | ≥ 40 min | ✅ |
| Trigger: HI fraction | ≤ 10% | ✅ |
| Trigger: low-intensity | (belowZ1 + Z1) / active ≥ 50% | ✅ |

### Stage 7 — Efficiency Factor

| HI Fraction | Spec | Code |
|-------------|------|------|
| < 10% | Formula: 1.0 − (HI × 7.0) | ✅ Reproduces A.7: E=0.78 |
| 10–25% | E = 0.82 | ✅ Reproduces A.5: E=0.82 |
| > 25% | E = 0.75 | ✅ |
| CYCLIC | E = 1.0 always | ✅ |

---

## Proof of Correctness

### Worked Example A.5 — BJJ Mixed (70kg, 30y, GRAPPLING)

Every intermediate value hand-traced outside the test suite:

| Stage | Value | Spec | Match |
|-------|-------|------|-------|
| Active duration | 82 min | 82 min | ✅ |
| Below-Z1 | 2 min warm-up | 2 min warm-up | ✅ |
| Z1 character | Moving, MET 1.3 | Moving, MET 1.3 | ✅ |
| Profile | G (no STRENGTH override) | G | ✅ |
| HI fraction | 14.6% | 14.6% | ✅ |
| E | 0.82 (table) | 0.82 | ✅ |
| Constant | 1.225 | 1.225 | ✅ |
| Per-min kcal | 1.0045 | 1.0045 | ✅ |
| HR model total | **342 kcal** | **342 kcal** | ✅ |
| Stage 6b | Not applied (not STRENGTH) | Not applied | ✅ |
| Device correction | 342/780 = 0.44 | 0.44 | ✅ |

### Worked Example A.7 — Hypertrophy (82kg, 34y, STRENGTH)

| Stage | Value | Spec | Match |
|-------|-------|------|-------|
| Active duration | 65 min | 65 min | ✅ |
| Below-Z1 split | 7 warm-up + 14 rest | 7 + 14 | ✅ |
| Z1 character | Standing, MET 1.0 | Standing, MET 1.0 | ✅ |
| STRENGTH override | Z3–Z5 = 5.0 net | Z3–Z5 = 5.0 net | ✅ |
| HI fraction | 3.1% | 3.1% | ✅ |
| E | 0.78 (formula) | 0.78 | ✅ |
| Constant | 1.435 | 1.435 | ✅ |
| Per-min kcal | 1.119 | 1.119 | ✅ |
| HR model total | **128 kcal** | **128 kcal** | ✅ |
| Benchmark MET | 3.5 gross → 2.5 net | 2.5 net | ✅ |
| Benchmark kcal | 2.5 × 1.435 × 65 × 0.78 = **182** | **182 kcal** | ✅ |
| Trigger: low-int fraction | (21+25)/65 = 70.8% | ≥ 50% | ✅ |
| Midpoint blend | (128 + 182) / 2 = **155** | **155 kcal** | ✅ |
| Device correction | 155/410 = 0.38 | 0.38 | ✅ |

---

## Known Spec Inconsistency (Documented, Not A Bug)

**Stage 7 efficiency factor** — the spec has an internal contradiction:

- The **summary table** says HI < 10% → E = 0.87
- The **worked example A.7** gives HI = 3.1% → E = 0.78

These can't both be true. The formula `1.0 − (HI × 7.0)` reproduces the worked
example exactly (0.78). The table gives 0.87 for the same input.

**Resolution:** Worked examples are more authoritative than summary tables. The
code uses the formula for HI < 10% (matching A.7) and the table for HI ≥ 10%
(matching A.5). This should be flagged to Roberto so he can clarify or update
his spec.

---

## What's NOT In This Branch

| Item | Why |
|------|-----|
| Wearable import UI | Needs product design — how does Roberto enter HR zone data? |
| category_id/session_type intake fields | The intake form needs new dropdowns for sport category + session type |
| Training schedule integration | The plan generator needs to pass `scpData` to `calculateExercise()` when HR zones are available |
| Stage 2 HR stream processing | The cutoff detection has a heuristic path (used when no per-second HR data exists) and a stream path (for FIT/TCX imports). Stream path exists but is untested against real device data. |
| Multi-session day handling | Double session days (e.g., morning BJJ + evening weights) need per-session SCP runs summed |

---

## Merge Checklist

- [ ] `git checkout main && git merge feat/sport-correction-protocol`
- [ ] `bun test` — expect 379/383 (4 pre-existing Playwright failures)
- [ ] `bun run build` — should compile clean
- [ ] Push to GitHub → Vercel redeploy
- [ ] No UI changes — SCP is engine-only, activated when `scpData` is present

---

## Files Changed (19 files, +2,612 / −13 lines)

```
src/engine/exercise.ts                              +51  -13   Integration
src/engine/types.ts                                 +18   -0   scpData on ExerciseSession
src/engine/sport-correction/types.ts                +280  -0   NEW
src/engine/sport-correction/index.ts                +174  -0   NEW
src/engine/sport-correction/stage0-tier.ts          +57   -0   NEW
src/engine/sport-correction/stage1-extract.ts       +37   -0   NEW
src/engine/sport-correction/stage2-cutoff.ts        +125  -0   NEW
src/engine/sport-correction/stage3-active.ts        +23   -0   NEW
src/engine/sport-correction/stage4-below-z1.ts      +81   -0   NEW
src/engine/sport-correction/stage5-z1-char.ts       +56   -0   NEW
src/engine/sport-correction/stage6-met.ts           +186  -0   NEW
src/engine/sport-correction/stage6b-benchmark.ts    +176  -0   NEW
src/engine/sport-correction/stage7-efficiency.ts    +102  -0   NEW
src/engine/sport-correction/stage8-eee.ts           +150  -0   NEW
src/engine/sport-correction/stage9-range.ts         +149  -0   NEW
src/engine/sport-correction/stage10-device.ts       +42   -0   NEW
src/engine/sport-correction/__tests__/bjj-mixed.test.ts      +206  -0   NEW
src/engine/sport-correction/__tests__/hypertrophy.test.ts     +306  -0   NEW
src/engine/sport-correction/__tests__/edge-cases.test.ts      +406  -0   NEW
```
