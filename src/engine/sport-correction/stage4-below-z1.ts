/**
 * Stage 4 — Below-Z1 Time Classification
 *
 * Spec v4.4.1: For strength training, below-Z1 time is decomposed by temporal
 * position within the session:
 *
 * Option C — structured low-intensity (warm-up): net MET 0.8–1.2 (use 1.0)
 *   - Appears at the START of the session (pre-set warm-up)
 *   - Spec default for STRENGTH: first 7 min of below-Z1
 *   - Spec default for GRAPPLING: first 5 min of below-Z1 (guard drill, pummeling)
 *   - Spec default for all cardio categories: first 5 min of below-Z1
 *
 * Option D — planned recovery/rest: net MET 0.3–0.5 (use 0.4)
 *   - Appears in the MIDDLE of the session (inter-set standing rest)
 *   - Spec default for STRENGTH: all remaining below-Z1 after warm-up
 *
 * Cool-down (terminal below-Z1) is already excluded by Stage 2 cutoff.
 *
 * Spec worked example A.7 (Hypertrophy):
 *   Total below-Z1 = 21 min (after Stage 2 excluded 15 min tail)
 *   Initial (Option C): 7 min, MET 1.0
 *   Middle (Option D): 14 min, MET 0.4  ✅
 *
 * Spec worked example A.5 (BJJ):
 *   Total below-Z1 = 2 min (after Stage 2 excluded 13 min tail)
 *   → 2 min → all Option C (warm-up), MET 1.0  ✅
 */

import type { BelowZ1Classification, CategoryId } from "./types";

/** Warm-up allocation for STRENGTH sessions (Option C, minutes) */
const STRENGTH_WARMUP_MIN = 7;
/** Warm-up allocation for all other sessions (Option C, minutes) */
const DEFAULT_WARMUP_MIN = 5;

/**
 * Classify below-Z1 time into warm-up (Option C) and inter-set rest (Option D).
 *
 * @param belowZ1Min - Total below-Z1 minutes (from adjusted zone data after Stage 2)
 * @param categoryId - Sport category (determines warm-up allocation)
 * @returns Below-Z1 classification with warm-up and inter-set rest minutes
 */
export function classifyBelowZ1(
  belowZ1Min: number,
  categoryId: CategoryId
): BelowZ1Classification {
  if (belowZ1Min <= 0) {
    return {
      warmUpMin: 0,
      interSetRestMin: 0,
      coolDownMin: 0,
      totalBelowZ1Min: 0,
    };
  }

  // Spec: for CYCLIC sessions, below-Z1 time is excluded from the EEE calculation
  // entirely (E=1.0 for CYCLIC; below-Z1 coasting is not metabolically significant).
  if (categoryId === "CYCLIC") {
    return {
      warmUpMin: 0,
      interSetRestMin: 0,
      coolDownMin: 0,
      totalBelowZ1Min: 0,
    };
  }

  const warmUpAllocation =
    categoryId === "STRENGTH" ? STRENGTH_WARMUP_MIN : DEFAULT_WARMUP_MIN;

  const warmUpMin = Math.min(belowZ1Min, warmUpAllocation);
  const remainder = Math.max(0, belowZ1Min - warmUpMin);

  if (categoryId === "STRENGTH") {
    // STRENGTH: remaining below-Z1 is inter-set rest (Option D)
    // Cool-down is already excluded by Stage 2
    return {
      warmUpMin,
      interSetRestMin: remainder,
      coolDownMin: 0,
      totalBelowZ1Min: belowZ1Min,
    };
  }

  // Cardio / combat sports: warm-up only — any residual treated as warm-up extension
  // (Stage 2 cutoff has already excluded the tail cool-down)
  return {
    warmUpMin: belowZ1Min, // all below-Z1 is warm-up for non-strength
    interSetRestMin: 0,
    coolDownMin: 0,
    totalBelowZ1Min: belowZ1Min,
  };
}
