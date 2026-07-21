/**
 * Basal Metabolic Rate.
 * Preferred: Katch-McArdle (370 + 21.6 × LBM) — body-recomp faithful.
 * D4 (R1, Roberto 2026-07-21): when NO body-composition data exists (the
 * body-fat method fell back to the BMI heuristic), BMR comes from
 * Harris-Benedict instead — his explicit ask ("an equation that does not
 * require body composition data") — rather than Katch on an invented LBM.
 */

import type { BmrResult } from "./types";
import type { BodyFatResult } from "./body-fat";

export interface BmrBasics {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: "male" | "female";
}

/** Harris-Benedict (revised 1984). */
export function harrisBenedictBmr(b: BmrBasics): number {
  return Math.round(
    b.sex === "male"
      ? 88.362 + 13.397 * b.weightKg + 4.799 * b.heightCm - 5.677 * b.ageYears
      : 447.593 + 9.247 * b.weightKg + 3.098 * b.heightCm - 4.33 * b.ageYears
  );
}

/**
 * Calculate BMR. Katch-McArdle from measured/manual body composition;
 * Harris-Benedict when the composition itself was only a BMI guess.
 */
export function calculateBmr(bodyFatResult: BodyFatResult, basics?: BmrBasics): BmrResult {
  const { bodyComposition } = bodyFatResult;

  if (bodyFatResult.method === "heuristic" && basics) {
    return {
      bmrKcal: harrisBenedictBmr(basics),
      bodyComposition,
      formula: "harris-benedict",
    };
  }

  const bmrKcal = 370 + 21.6 * bodyComposition.leanMassKg;
  return {
    bmrKcal: Math.round(bmrKcal),
    bodyComposition,
    formula: "katch-mcardle",
  };
}

/**
 * Direct BMR calculation from lean mass.
 * Useful when body composition is already known.
 */
export function bmrFromLeanMass(leanMassKg: number): number {
  return Math.round(370 + 21.6 * leanMassKg);
}
