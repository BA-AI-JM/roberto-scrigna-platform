/**
 * Non-Exercise Activity Thermogenesis (NEAT) calculation.
 *
 * Two components:
 * 1. Step-based NEAT: kcal burned from daily steps
 * 2. Occupational NEAT: additional kcal from job activity level
 *
 * Step-based formula: ~0.04 kcal per step per kg body weight (simplified).
 * More precisely calibrated as per Roberto's spec.
 */

import type { OccupationalLevel, NeatResult } from "./types";

// ── Step-Based NEAT ───────────────────────────────────────────────────────────

/**
 * Approximate kcal per step.
 * Literature range: 0.03-0.06 kcal/step depending on weight/speed.
 * Roberto's calibration: ~0.04 kcal/step for a 70kg person, scaled by weight.
 */
const KCAL_PER_STEP_PER_KG = 0.0005;

function stepsKcal(steps: number, weightKg: number): number {
  return Math.round(steps * KCAL_PER_STEP_PER_KG * weightKg);
}

// ── Occupational NEAT ─────────────────────────────────────────────────────────

/**
 * Additional daily kcal from occupational activity (above sedentary baseline).
 * These values represent the EXTRA expenditure beyond what BMR covers.
 */
const OCCUPATIONAL_KCAL: Record<OccupationalLevel, number> = {
  sedentary: 0,
  light: 200,
  moderate: 400,
  heavy: 600,
  very_heavy: 800,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calculate total NEAT from steps and occupational activity.
 *
 * @param dailySteps - Average daily step count
 * @param weightKg - Client weight in kg
 * @param occupationalLevel - Job activity level
 * @returns Breakdown of NEAT components and total
 */
export function calculateNeat(
  dailySteps: number,
  weightKg: number,
  occupationalLevel: OccupationalLevel
): NeatResult {
  const stepsComponent = stepsKcal(dailySteps, weightKg);
  const occupationalComponent = OCCUPATIONAL_KCAL[occupationalLevel];

  return {
    stepsKcal: stepsComponent,
    occupationalKcal: occupationalComponent,
    totalNeatKcal: stepsComponent + occupationalComponent,
  };
}
