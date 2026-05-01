/**
 * Stage 9 — Uncertainty Range Propagation
 *
 * Spec v4.4.1: Propagate uncertainty from two sources:
 *   - Efficiency factor E: ±0.03 perturbation
 *   - Below-Z1 MET (warm-up): ±0.2 perturbation
 *
 * For STRENGTH sessions where Stage 6b blending was applied (midpoint):
 *   blendedLow  = (hrLow + benchmark) / 2
 *   blendedHigh = (hrHigh + benchmark) / 2
 *
 * For Tier 2 data (no zone breakdown, average HR only):
 *   Widen the range by ±10%.
 */

import type {
  SportProfile,
  BelowZ1Classification,
  Z1Character,
  EfficiencyResult,
  UncertaintyRange,
  HRZoneData,
  DataTier,
} from "./types";
import { calculateEEE } from "./stage8-eee";

/** Perturbation applied to efficiency factor for uncertainty bounds */
const E_DELTA = 0.03;
/** Perturbation applied to below-Z1 warm-up MET for uncertainty bounds */
const BELOW_Z1_MET_DELTA = 0.2;
/** Additional range widening for Tier 2 data (no zone breakdown) */
const TIER2_WIDEN_FRACTION = 0.10;

/**
 * Compute the uncertainty range for the final EEE.
 *
 * @param zoneData - Adjusted zone data (Stage 2 output)
 * @param belowZ1 - Below-Z1 classification (Stage 4 output)
 * @param z1Char - Z1 character (Stage 5 output)
 * @param sportProfile - Sport profile (Stage 6 output)
 * @param baseEfficiency - Efficiency result (Stage 7 output)
 * @param weightKg - Client body weight
 * @param centralKcal - The final central kcal (after any blending)
 * @param benchmarkKcal - Benchmark kcal from Stage 6b (0 if not applied)
 * @param benchmarkApplied - Whether Stage 6b blending was applied
 * @param tier - Data quality tier
 */
export function propagateUncertainty(
  zoneData: HRZoneData,
  belowZ1: BelowZ1Classification,
  z1Char: Z1Character,
  sportProfile: SportProfile,
  baseEfficiency: EfficiencyResult,
  weightKg: number,
  centralKcal: number,
  benchmarkKcal: number,
  benchmarkApplied: boolean,
  tier: DataTier
): UncertaintyRange {
  // ── Perturb efficiency factor ───────────────────────────────────────────────
  const eLow = Math.max(0.5, Math.min(1.0, baseEfficiency.efficiencyFactor - E_DELTA));
  const eHigh = Math.max(0.5, Math.min(1.0, baseEfficiency.efficiencyFactor + E_DELTA));

  // ── Perturb below-Z1 warm-up MET ───────────────────────────────────────────
  const belowZ1MetLow = Math.max(
    0,
    sportProfile.netMETs.belowZ1WarmUp - BELOW_Z1_MET_DELTA
  );
  const belowZ1MetHigh = sportProfile.netMETs.belowZ1WarmUp + BELOW_Z1_MET_DELTA;

  const hrLow = computeHRModel(
    zoneData, belowZ1, z1Char, sportProfile, belowZ1MetLow,
    { hiFraction: baseEfficiency.hiFraction, efficiencyFactor: eLow },
    weightKg
  );

  const hrHigh = computeHRModel(
    zoneData, belowZ1, z1Char, sportProfile, belowZ1MetHigh,
    { hiFraction: baseEfficiency.hiFraction, efficiencyFactor: eHigh },
    weightKg
  );

  let lowKcal: number;
  let highKcal: number;

  if (benchmarkApplied && benchmarkKcal > 0) {
    // Stage 6b was applied — propagate uncertainty through the midpoint blend
    // Midpoint: (hrModel + benchmark) / 2
    // When we perturb hrModel, the midpoint shifts by half of the perturbation
    const midLow = benchmarkKcal > hrLow
      ? (hrLow + benchmarkKcal) / 2
      : hrLow;
    const midHigh = benchmarkKcal > hrHigh
      ? (hrHigh + benchmarkKcal) / 2
      : hrHigh;
    lowKcal = Math.round(Math.min(midLow, midHigh));
    highKcal = Math.round(Math.max(midLow, midHigh));
  } else {
    lowKcal = Math.round(hrLow);
    highKcal = Math.round(hrHigh);
  }

  // Ensure ordering
  if (lowKcal > highKcal) {
    [lowKcal, highKcal] = [highKcal, lowKcal];
  }

  // Tier 2 widening: broader uncertainty without zone breakdown
  if (tier === 2) {
    lowKcal = Math.round(centralKcal * (1 - TIER2_WIDEN_FRACTION));
    highKcal = Math.round(centralKcal * (1 + TIER2_WIDEN_FRACTION));
  }

  return {
    lowKcal,
    highKcal,
    centralKcal,
    spreadKcal: highKcal - lowKcal,
  };
}

/** Re-run Stage 8 with perturbed MET and efficiency values */
function computeHRModel(
  zoneData: HRZoneData,
  belowZ1: BelowZ1Classification,
  z1Char: Z1Character,
  sportProfile: SportProfile,
  overrideBelowZ1WarmUpMET: number,
  efficiency: EfficiencyResult,
  weightKg: number
): number {
  // Build a modified sport profile with the perturbed below-Z1 warm-up MET
  const modifiedProfile: SportProfile = {
    ...sportProfile,
    netMETs: {
      ...sportProfile.netMETs,
      belowZ1WarmUp: overrideBelowZ1WarmUpMET,
    },
  };
  const result = calculateEEE(
    zoneData,
    belowZ1,
    z1Char,
    modifiedProfile,
    efficiency,
    weightKg
  );
  return result.hrModelKcal;
}
