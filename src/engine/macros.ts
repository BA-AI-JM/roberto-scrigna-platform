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
  // #17 periodization tiers (modes 3-4) — provisional: clone the training
  // ratios. Intensity differentiation comes from TDEE (per-day session
  // expenditure) + the carb remainder, NOT from protein/fat ratio shifts.
  // provisional — Roberto to calibrate intensity ratios
  training_light: { proteinPerKgLbm: 2.5, fatPerKgBw: 0.9 },
  training_medium: { proteinPerKgLbm: 2.5, fatPerKgBw: 0.9 },
  training_intense: { proteinPerKgLbm: 2.5, fatPerKgBw: 0.9 },
  training_double: { proteinPerKgLbm: 2.5, fatPerKgBw: 0.9 },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Per-day-type absolute macro override (grams). Any subset of the three
 * may be set — values left undefined fall back to the formula
 * (proteinPerKgLbm × LBM / fatPerKgBw × BW / remaining kcal as carbs).
 */
export interface MacroOverrideGrams {
  proteinG?: number;
  fatG?: number;
  carbG?: number;
}

export interface MacroOptions {
  /** Override protein g/kg LBM */
  proteinPerKgLbm?: number;
  /** Override fat g/kg BW */
  fatPerKgBw?: number;
  /**
   * Absolute-gram overrides per day-type. The wizard exposes this as
   * "Macro per giorno" so the practitioner can pin P/F/C grams without
   * going through the deficit math.
   */
  absoluteOverrides?: Partial<Record<DayType, MacroOverrideGrams>>;
  /**
   * #26 injury/stress — additive bump to protein g/kg LBM (on top of the
   * day-type or overridden proteinPerKgLbm) for injury recovery. Absent / 0 =
   * no effect (byte-identical). Only affects the FORMULA path, not an absolute
   * per-day-type override. provisional — Roberto to calibrate.
   */
  injuryProteinBumpGPerKg?: number;
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
  const dayOverride = options.absoluteOverrides?.[dayType];

  // Protein — absolute override wins; else formula (+ #26 injury bump on the
  // per-kg rate; 0 = byte-identical).
  const proteinPerKgLbm =
    (options.proteinPerKgLbm ?? multipliers.proteinPerKgLbm) +
    (options.injuryProteinBumpGPerKg ?? 0);
  const proteinG =
    dayOverride?.proteinG != null
      ? Math.max(0, Math.round(dayOverride.proteinG))
      : Math.round(proteinPerKgLbm * bodyComp.leanMassKg);

  // Fat — absolute override wins; else formula
  const fatPerKgBw = options.fatPerKgBw ?? multipliers.fatPerKgBw;
  const fatG =
    dayOverride?.fatG != null
      ? Math.max(0, Math.round(dayOverride.fatG))
      : Math.round(fatPerKgBw * totalWeightKg);

  // Carbs — explicit override OR remaining kcal after P+F
  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;
  const fatKcal = fatG * KCAL_PER_G_FAT;
  // On the FORMULA path, a negative remainder means protein+fat alone exceed the
  // target: carbs floor to 0 and the achieved kcal overshoots the target (the
  // deficit is under-delivered). Flag it so the plan surfaces it rather than
  // shipping a silently-over plan. An explicit carbG override is taken as-is.
  const usesCarbFormula = dayOverride?.carbG == null;
  const carbFloorApplied = usesCarbFormula && tdeeKcal - proteinKcal - fatKcal < 0;
  const carbG =
    dayOverride?.carbG != null
      ? Math.max(0, Math.round(dayOverride.carbG))
      : Math.max(0, Math.round((tdeeKcal - proteinKcal - fatKcal) / KCAL_PER_G_CARB));

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
    ...(carbFloorApplied
      ? { carbFloorApplied: true, carbFloorKcalOver: Math.round(totalKcal - tdeeKcal) }
      : {}),
  };
}
