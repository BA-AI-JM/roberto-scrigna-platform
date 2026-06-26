/**
 * Roberto Scrigna Macro Calculation Engine
 *
 * Pure TypeScript engine implementing spec v4.4 / v4.4.1:
 * - Body fat estimation (J&P 7-site, 3-site, heuristic)
 * - BMR (Katch-McArdle)
 * - TEF (Thermic Effect of Food)
 * - NEAT (steps + occupational)
 * - Exercise kcal (4-method priority with v4.4.1 recalibration)
 * - TDEE per day-type with manual overrides
 * - Macro targets (P/F/C with training adjustments)
 * - Hydration & salt
 */

// Types
export type {
  Sex,
  OccupationalLevel,
  DayType,
  Skinfold7Site,
  Skinfold3Site,
  Skinfold3SiteMale,
  Skinfold3SiteFemale,
  BodyComposition,
  ClientSnapshot,
  ExerciseMethod,
  ExerciseSession,
  TdeeOverride,
  BmrResult,
  NeatResult,
  TefResult,
  ExerciseResult,
  TdeeResult,
  MacroTargets,
  HydrationTargets,
  DailyPlan,
  WeeklyPlan,
} from "./types";

// Body Fat
export { estimateBodyFat, type BodyFatMethod, type BodyFatResult } from "./body-fat";

// BMR
export { calculateBmr, bmrFromLeanMass } from "./bmr";

// TEF
export { calculateTef, TEF_RANGES, type DietEmphasis } from "./tef";

// NEAT
export { calculateNeat } from "./neat";

// Exercise
export { calculateExercise, restDayExercise, type ExerciseContext } from "./exercise";

// TDEE
export { calculateTdee, calculateWeeklyTdee, type TdeeOptions } from "./tdee";

// Macros
export { calculateMacros, type MacroOptions } from "./macros";

// Hydration
export { calculateHydration, waterLoadingSchedule } from "./hydration";
export type { WaterLoadingSchedule, WaterLoadingDay } from "./hydration";

// ── Convenience: Full Daily Plan ──────────────────────────────────────────────

import type {
  ClientSnapshot,
  DayType,
  DailyPlan,
  WeeklyPlan,
  ExerciseSession,
} from "./types";
import { calculateTdee, calculateWeeklyTdee, type TdeeOptions } from "./tdee";
import { calculateMacros, type MacroOptions } from "./macros";
import { calculateHydration } from "./hydration";

export interface PlanOptions extends TdeeOptions {
  macroOptions?: MacroOptions;
  /**
   * Daily kcal deficit (positive) or surplus (negative) to apply to each
   * day's TDEE before macros are calculated. When set, the macro engine
   * targets `tdee.totalTdeeKcal − dailyDeficitKcal` per day; the weekly
   * average naturally shifts too. Comes from the target-date deficit
   * calculator (engine/goal-rate.ts) or a direct practitioner override.
   */
  dailyDeficitKcal?: number;
  /**
   * Per-day-of-week exercise session override (length-7 array, Mon-Sun).
   * When the entry at index `i` is set AND the day's DayType is "training",
   * that session is used in place of `options.trainingSession`. Entries set
   * to `null`/`undefined` (or any non-training day) fall back to the global
   * `trainingSession` or the engine default. Lets the practitioner schedule
   * different sports on different days (BJJ Mon, lifting Tue, MMA Wed…).
   */
  perDayTrainingSession?: (ExerciseSession | null | undefined)[];
}

/**
 * Generate a complete daily plan for a client.
 */
export function generateDailyPlan(
  snapshot: ClientSnapshot,
  dayType: DayType,
  options: PlanOptions = {}
): DailyPlan {
  const tdee = calculateTdee(snapshot, dayType, options);
  const targetKcal = tdee.totalTdeeKcal - (options.dailyDeficitKcal ?? 0);
  const macros = calculateMacros(
    targetKcal,
    tdee.bmr.bodyComposition,
    snapshot.weightKg,
    dayType,
    options.macroOptions
  );
  const hydration = calculateHydration(snapshot.weightKg, dayType);

  return { dayType, tdee, macros, hydration };
}

/**
 * Generate a complete weekly plan for a client.
 */
export function generateWeeklyPlan(
  snapshot: ClientSnapshot,
  options: PlanOptions = {}
): WeeklyPlan {
  const perDay = options.perDayTrainingSession;
  const days = snapshot.weekSchedule.map((dayType, i) => {
    const override = perDay?.[i];
    if (override && dayType === "training") {
      return generateDailyPlan(snapshot, dayType, {
        ...options,
        trainingSession: override,
      });
    }
    return generateDailyPlan(snapshot, dayType, options);
  }) as WeeklyPlan["days"];

  const weeklyAverageKcal = Math.round(
    days.reduce((sum, d) => sum + d.macros.totalKcal, 0) / 7
  );
  const weeklyAverageProteinG = Math.round(
    days.reduce((sum, d) => sum + d.macros.proteinG, 0) / 7
  );

  return { days, weeklyAverageKcal, weeklyAverageProteinG };
}
