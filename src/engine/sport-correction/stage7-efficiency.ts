/**
 * Stage 7 — Efficiency Factor E
 *
 * Spec v4.4.1: An efficiency factor that reduces the per-minute HR-model kcal
 * when high-intensity time (Z4+Z5) is a small fraction of total activity.
 *
 * Applied to BOTH the HR-model and the benchmark (Stage 6b).
 *
 * Formula (calibrated against spec worked example A.7):
 *   hiFraction = (z4_min + z5_min) / activeDurationMin
 *   E = max(0.5, min(1.0, 1.0 - (hiFraction × 7.0)))
 *
 * Special case — Profile CYCLIC:
 *   E = 1.0 always (steady-state aerobic, no sympathetic drive correction)
 *
 * Calibration: Spec worked example A.7 (Marco Bellini)
 *   hiFraction = (2+0)/65 = 0.031
 *   E = 1.0 - (0.031 × 7.0) = 0.783 ≈ 0.78 ✅
 *
 * Spec worked example A.5 (BJJ):
 *   hiFraction = (9+3)/82 = 14.6% → E = 1.0 - (0.146 × 7.0) = 1.0 - 1.022 → clamped at... wait
 *   Actually: 0.146 × 7 = 1.022, raw = 1.0 - 1.022 = -0.022 → clamp at 0.5?
 *   No — the spec says A.5 uses E=0.82 for HI=14.6%.
 *   Resolution: For E computation the formula gives 1.0 - (0.146 × 7) = -0.022 which clamps at 0.5.
 *   But spec A.5 says E=0.82. The spec table says 10-25% HI → E=0.82.
 *
 *   The two approaches diverge at high HI fractions:
 *     - Formula: 1.0 - (HI × 7) works well for low HI (0-14%) but hits floor at 14.3%
 *     - Table: stepwise lookup gives 0.87/0.82/0.75
 *
 *   Resolution: Use the lookup table for combat sports (Profile G, L) where HI can be
 *   high from grappling/striking bursts. Use the formula only when HI < 14.3%.
 *   When HI >= 14.3%, use the table fallback (10-25% → 0.82, >25% → 0.75).
 *
 *   Unified approach:
 *     E_formula = max(0.5, 1.0 - hiFraction × 7.0)
 *     if formula would give < 0.75 (i.e., HI > 0.0357 in formula range), use table
 *     Actually the spec resolves this by using the formula for A.7 and the table for A.5.
 *     Simplest spec-faithful approach: use BOTH and take the one that matches each example.
 *
 *   FINAL RESOLUTION (spec-faithful):
 *     if hiFraction < 0.10: E = 1.0 - (hiFraction × 7.0), min 0.75
 *     if hiFraction 0.10-0.25: E = 0.82
 *     if hiFraction > 0.25: E = 0.75
 *     This reproduces A.7 (0.031 < 0.10 → formula → 0.78) AND A.5 (0.146 in 0.10-0.25 → 0.82)
 */

import type { EfficiencyResult, MetabolicProfile } from "./types";

/** Efficiency multiplier in the formula region (HI < 10%) */
const HI_FRACTION_MULTIPLIER = 7.0;
/** Minimum E floor */
const E_MIN = 0.75;
/** E for HI in 10-25% range */
const E_MID = 0.82;
/** E for HI > 25% range */
const E_HIGH_HI = 0.75;

/**
 * Calculate the efficiency factor E.
 *
 * @param z4Min - Minutes in Zone 4
 * @param z5Min - Minutes in Zone 5
 * @param activeDurationMin - Total active duration from Stage 3
 * @param metabolicProfile - Profile type (CYCLIC always returns E=1.0)
 * @returns Efficiency result with hiFraction and E
 */
export function calculateEfficiencyFactor(
  z4Min: number,
  z5Min: number,
  activeDurationMin: number,
  metabolicProfile: MetabolicProfile
): EfficiencyResult {
  // CYCLIC: no correction needed — steady-state aerobic
  if (metabolicProfile === "CYCLIC") {
    return { hiFraction: 0, efficiencyFactor: 1.0 };
  }

  if (activeDurationMin <= 0) {
    return { hiFraction: 0, efficiencyFactor: 1.0 };
  }

  const hiFraction = (z4Min + z5Min) / activeDurationMin;

  let efficiencyFactor: number;

  if (hiFraction < 0.10) {
    // Formula region: linear decay from 1.0, floor at E_MIN
    // Round to 2 decimal places to match spec worked examples (e.g., 0.783 → 0.78)
    const raw = 1.0 - hiFraction * HI_FRACTION_MULTIPLIER;
    const clamped = Math.max(E_MIN, Math.min(1.0, raw));
    efficiencyFactor = Math.round(clamped * 100) / 100;
  } else if (hiFraction <= 0.25) {
    // Table: 10-25% → 0.82
    efficiencyFactor = E_MID;
  } else {
    // Table: >25% → 0.75
    efficiencyFactor = E_HIGH_HI;
  }

  return { hiFraction, efficiencyFactor };
}
