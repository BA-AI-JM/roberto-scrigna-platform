/**
 * Basal Metabolic Rate calculation using Katch-McArdle formula.
 * BMR = 370 + (21.6 × lean mass in kg)
 *
 * This is the preferred formula for body-recomp clients because
 * it accounts for lean mass rather than total weight.
 */

import type { BodyComposition, BmrResult } from "./types";
import type { BodyFatResult } from "./body-fat";

/**
 * Calculate BMR using Katch-McArdle.
 * @param bodyFatResult - Result from body fat estimation
 * @returns BMR in kcal/day and body composition data
 */
export function calculateBmr(bodyFatResult: BodyFatResult): BmrResult {
  const { bodyComposition } = bodyFatResult;
  const bmrKcal = 370 + 21.6 * bodyComposition.leanMassKg;

  return {
    bmrKcal: Math.round(bmrKcal),
    bodyComposition,
  };
}

/**
 * Direct BMR calculation from lean mass.
 * Useful when body composition is already known.
 */
export function bmrFromLeanMass(leanMassKg: number): number {
  return Math.round(370 + 21.6 * leanMassKg);
}
