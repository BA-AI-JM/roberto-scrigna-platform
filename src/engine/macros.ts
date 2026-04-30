/**
 * Macro target calculations: Protein, Fat, Carbs.
 *
 * Spec v4.4 guidelines:
 * - Protein: 2.5 g/kg LBM (training) or 2.2 g/kg LBM (rest)
 * - Fat: 0.8-1.2 g/kg total BW
 * - Carbs: remaining kcal after protein & fat
 *
 * Training adjustments:
 * - Training days: higher carbs, moderate fat
 * - Rest days: moderate carbs, slightly higher fat
 * - Refeed days: high carbs, reduced fat
 * - Deload days: same as rest
 */

import type { DayType, MacroTargets, BodyComposition } from "./types";

// ── Caloric values per gram ───────────────────────────────────────────────────

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;

// ── Per day-type multipliers ──────────────────────────────────────────────────

interface MacroMultipliers {
  /** g/kg lean body mass */
  proteinPerKgLbm: number;
  /** g/kg total body weight */
  fatPerKgBw: number;
}

const DAY_TYPE_MULTIPLIERS: Record<DayType, MacroMultipliers> = {
  training: { proteinPerKgLbm: 2.5, fatPerKgBw: 0.9 },
  rest: { proteinPerKgLbm: 2.2, fatPerKgBw: 1.0 },
  refeed: { proteinPerKgLbm: 2.2, fatPerKgBw: 0.7 },
  deload: { proteinPerKgLbm: 2.2, fatPerKgBw: 1.0 },
};

// ── Public API ────────────────────────────────────────────────────────────────

export interface MacroOptions {
  /** Override protein g/kg LBM */
  proteinPerKgLbm?: number;
  /** Override fat g/kg BW */
  fatPerKgBw?: number;
}

/**
 * Calculate macro targets for a given day type and TDEE.
 *
 * @param tdeeKcal - Total daily energy expenditure
 * @param bodyComp - Body composition (lean mass, total weight derived from it)
 * @param totalWeightKg - Client's total body weight
 * @param dayType - Type of day
 * @param options - Optional overrides for multipliers
 * @returns Macro targets in grams with total kcal
 */
export function calculateMacros(
  tdeeKcal: number,
  bodyComp: BodyComposition,
  totalWeightKg: number,
  dayType: DayType,
  options: MacroOptions = {}
): MacroTargets {
  const multipliers = DAY_TYPE_MULTIPLIERS[dayType];

  // Protein
  const proteinPerKgLbm = options.proteinPerKgLbm ?? multipliers.proteinPerKgLbm;
  const proteinG = Math.round(proteinPerKgLbm * bodyComp.leanMassKg);

  // Fat
  const fatPerKgBw = options.fatPerKgBw ?? multipliers.fatPerKgBw;
  const fatG = Math.round(fatPerKgBw * totalWeightKg);

  // Carbs = remaining kcal
  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;
  const fatKcal = fatG * KCAL_PER_G_FAT;
  const remainingKcal = tdeeKcal - proteinKcal - fatKcal;
  const carbG = Math.max(0, Math.round(remainingKcal / KCAL_PER_G_CARB));

  // Actual total (may differ slightly from tdeeKcal due to rounding)
  const totalKcal =
    proteinG * KCAL_PER_G_PROTEIN +
    fatG * KCAL_PER_G_FAT +
    carbG * KCAL_PER_G_CARB;

  return {
    proteinG,
    fatG,
    carbG,
    totalKcal,
    dayType,
  };
}
