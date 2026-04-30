/**
 * Stage 6b — Mechanical Density Check / Benchmark (v4.4.1 key stage)
 *
 * Spec v4.4.1: The critical recalibration stage for STRENGTH category sessions.
 *
 * Problem: HR-based models were derived from aerobic exercise. During resistance
 * training, HR is elevated by sympathetic drive, not metabolic rate. This causes
 * systematic underestimation of actual EEE.
 *
 * Solution: Compute an ACSM-MET-based benchmark for the session type.
 * If the HR model produces fewer kcal than the benchmark, use the midpoint.
 * If the HR model is higher, trust the HR model.
 *
 * Trigger criteria (all must be met):
 *   - Active duration ≥ 40 min
 *   - HI fraction (Z4+Z5 / active) ≤ 10%
 *   - BelowZ1 fraction (belowZ1 / active) ≥ 50%
 *
 * Benchmark formula (spec §6b):
 *   MET_gross: 3.5 for conventional (hypertrophy, strength, power, deload)
 *              5.0 for circuit-style
 *   MET_net = MET_gross - 1.0 (Profile G subtraction)
 *   kcal_benchmark = MET_net × (3.5 × weightKg / 200) × activeDurationMin × E
 *
 * Blend rule when HR model < benchmark:
 *   primary_kcal = (kcal_HR_model + kcal_benchmark) / 2   ← midpoint (50/50)
 *
 * Spec worked example A.7 verification:
 *   MET_net = 2.5, constant = 1.435, E = 0.78
 *   kcal_benchmark = 2.5 × 1.435 × 65 × 0.78 = 182 kcal
 *   HR model = 128 kcal → midpoint = (128 + 182) / 2 = 155 kcal ✅
 */

import type { SessionType, BenchmarkResult } from "./types";

// ── Benchmark MET Gross Table ─────────────────────────────────────────────────

/**
 * Gross MET values for STRENGTH category session types.
 * Source: ACSM Compendium of Physical Activities + spec §6b calibration.
 *
 * Conventional resistance training (hypertrophy, strength, power, deload): 3.5
 * Circuit-style weight training: 5.0
 */
const BENCHMARK_GROSS_MET: Partial<Record<SessionType, number>> = {
  hypertrophy: 3.5,
  strength:    3.5,
  power:       3.5,
  deload:      3.5,
  circuit:     5.0,
};

/** Profile G net subtraction for the benchmark MET */
const PROFILE_G_SUBTRACTION = 1.0;

// ── Trigger Criteria ──────────────────────────────────────────────────────────

/** Minimum active duration for Stage 6b to trigger (minutes) */
const TRIGGER_MIN_DURATION = 40;
/** Maximum HI fraction (Z4+Z5 / active) for Stage 6b to trigger */
const TRIGGER_MAX_HI_FRACTION = 0.10;
/** Minimum below-Z1 fraction (belowZ1 / active) for Stage 6b to trigger */
const TRIGGER_MIN_BELOW_Z1_FRACTION = 0.50;

// ── Blend Rule ────────────────────────────────────────────────────────────────

/** Midpoint blend: 50% benchmark + 50% HR model */
const BLEND_BENCHMARK = 0.5;
const BLEND_HR_MODEL = 0.5;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the mechanical density benchmark check.
 *
 * @param sessionType - Session type (only STRENGTH category types produce a benchmark)
 * @param weightKg - Client body weight
 * @param activeDurationMin - Active session duration from Stage 3
 * @param hrModelKcal - HR-model total from Stage 8 (pre-benchmark)
 * @param isStrengthCategory - From sport profile
 * @param hiFraction - Z4+Z5 fraction of active duration (from Stage 7)
 * @param belowZ1Min - Total below-Z1 minutes (from Stage 4)
 * @param z1Min - Total Z1 minutes (from zone data)
 * @param efficiencyFactor - E value from Stage 7 (applied to benchmark per spec)
 * @returns Benchmark result with midpoint-blended kcal
 */
export function runBenchmark(
  sessionType: SessionType,
  weightKg: number,
  activeDurationMin: number,
  hrModelKcal: number,
  isStrengthCategory: boolean,
  hiFraction: number,
  belowZ1Min: number,
  efficiencyFactor: number,
  z1Min = 0
): BenchmarkResult {
  // Stage 6b only applies to STRENGTH category sessions
  if (!isStrengthCategory) {
    return notApplied(hrModelKcal, activeDurationMin);
  }

  const grossMET = BENCHMARK_GROSS_MET[sessionType];
  if (grossMET == null) {
    return notApplied(hrModelKcal, activeDurationMin);
  }

  // ── Evaluate trigger criteria ───────────────────────────────────────────────
  const durationOk = activeDurationMin >= TRIGGER_MIN_DURATION;
  const hiFractionOk = hiFraction <= TRIGGER_MAX_HI_FRACTION;
  // Spec A.7: "70.8% ≥ 50%" = (belowZ1 + Z1) / active = (21 + 25) / 65 = 70.8%
  // The low-intensity fraction includes both below-Z1 and Z1 (standing/recovery time)
  const lowIntensityMin = belowZ1Min + z1Min;
  const belowZ1Fraction = activeDurationMin > 0 ? lowIntensityMin / activeDurationMin : 0;
  const belowZ1FractionOk = belowZ1Fraction >= TRIGGER_MIN_BELOW_Z1_FRACTION;

  const triggerMet = { durationOk, hiFractionOk, belowZ1FractionOk };

  if (!durationOk || !hiFractionOk || !belowZ1FractionOk) {
    return notApplied(hrModelKcal, activeDurationMin, triggerMet);
  }

  // ── Compute benchmark ───────────────────────────────────────────────────────
  const netMET = grossMET - PROFILE_G_SUBTRACTION;
  // ACSM constant: (3.5 mL O₂/kg/min × weightKg) / 200 converts to kcal/min
  const constant = (3.5 * weightKg) / 200;
  // E is applied to the benchmark — confirmed by spec worked example A.7
  const benchmarkKcal = netMET * constant * activeDurationMin * efficiencyFactor;

  // ── Blend rule ──────────────────────────────────────────────────────────────
  let blendedKcal: number;
  let blendRatio: { benchmark: number; hrModel: number };

  if (hrModelKcal < benchmarkKcal) {
    // HR model underestimates — use midpoint (50/50)
    blendedKcal = BLEND_BENCHMARK * benchmarkKcal + BLEND_HR_MODEL * hrModelKcal;
    blendRatio = { benchmark: BLEND_BENCHMARK, hrModel: BLEND_HR_MODEL };
  } else {
    // HR model matches or exceeds benchmark — trust the HR model
    blendedKcal = hrModelKcal;
    blendRatio = { benchmark: 0, hrModel: 1 };
  }

  return {
    benchmarkMETGross: grossMET,
    benchmarkMETNet: netMET,
    benchmarkKcal: Math.round(benchmarkKcal),
    hrModelKcal: Math.round(hrModelKcal),
    blendedKcal: Math.round(blendedKcal),
    blendRatio,
    benchmarkApplied: true,
    triggerMet,
  };
}

/** Build a "not applied" result for non-strength or non-triggered sessions */
function notApplied(
  hrModelKcal: number,
  _activeDurationMin: number,
  triggerMet = {
    durationOk: false,
    hiFractionOk: false,
    belowZ1FractionOk: false,
  }
): BenchmarkResult {
  return {
    benchmarkMETGross: 0,
    benchmarkMETNet: 0,
    benchmarkKcal: 0,
    hrModelKcal,
    blendedKcal: hrModelKcal,
    blendRatio: { benchmark: 0, hrModel: 1 },
    benchmarkApplied: false,
    triggerMet,
  };
}
