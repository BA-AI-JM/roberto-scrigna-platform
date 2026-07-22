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
import { isTrainingLikeDayType } from "./types";
import { calculateTdee, type TdeeOptions } from "./tdee";
import { calculateMacros, type MacroOptions } from "./macros";
import { applyCarbLedTierRule, type CarbLedAdjustment } from "./carb-led-tiers";
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
  /**
   * B-eng2 / R14 Model B (Roberto 2026-07-22). Periodization STRATEGY chosen by
   * the coach:
   *  - "weekly_average": every day targets the mean weekly expenditure − goal
   *    (flat plan).
   *  - "differentiated" | undefined: each day targets its OWN expenditure − goal
   *    (current behaviour), unless overridden per-day below.
   */
  periodizationStrategy?: "weekly_average" | "differentiated";
  /**
   * Per-day-of-week calorie TARGET override (length-7, Mon-Sun). When set, that
   * day's intake target is exactly this value — and MAY EXCEED the day's
   * expenditure (a refeed): the macro engine puts the surplus into carbs, since
   * protein (per LBM) and fat (per BW) are body-fixed and carbs are the
   * remainder. This is Roberto's Model-B override; it wins over the strategy.
   */
  perDayTargetKcalOverride?: (number | null | undefined)[];
  /**
   * Per-day coach LEVEL label (off/light/medium/heavy), Mon-Sun — display only,
   * carried through for the review UI; does not change the maths.
   */
  perDayLevel?: (string | null | undefined)[];
  /**
   * Internal: an explicit resolved calorie target for a SINGLE day, injected by
   * generateWeeklyPlan after it resolves strategy + overrides. Not set by
   * callers of generateDailyPlan directly in normal flow.
   */
  targetKcalOverride?: number;
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
  // B-eng2: an explicit resolved target (from generateWeeklyPlan's Model-B
  // resolution) wins; otherwise the classic expenditure − goal.
  const targetKcal =
    options.targetKcalOverride ?? tdee.totalTdeeKcal - (options.dailyDeficitKcal ?? 0);
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
  const deficit = options.dailyDeficitKcal ?? 0;

  // Per-day options with the correct exercise session applied (training days).
  const dayOptions = snapshot.weekSchedule.map((dayType, i) => {
    const sess = perDay?.[i];
    return sess && isTrainingLikeDayType(dayType)
      ? { ...options, trainingSession: sess }
      : options;
  });

  // Pass 1: each day's EXPENDITURE (TDEE) — needed before the weekly mean and
  // before we resolve Model-B targets.
  const tdees = snapshot.weekSchedule.map((dayType, i) =>
    calculateTdee(snapshot, dayType, dayOptions[i]!)
  );
  const meanExpenditure = Math.round(
    tdees.reduce((sum, t) => sum + t.totalTdeeKcal, 0) / tdees.length
  );

  // Pass 2: resolve each day's TARGET (B-eng2 / Model B) and generate.
  //   per-day override  → wins (may exceed expenditure: a refeed)
  //   weekly_average    → mean expenditure − goal, every day
  //   else              → own expenditure − goal (classic, unchanged)
  const days = snapshot.weekSchedule.map((dayType, i) => {
    const ovr = options.perDayTargetKcalOverride?.[i];
    const target =
      ovr != null
        ? ovr
        : options.periodizationStrategy === "weekly_average"
          ? meanExpenditure - deficit
          : tdees[i]!.totalTdeeKcal - deficit;
    return generateDailyPlan(snapshot, dayType, {
      ...dayOptions[i]!,
      targetKcalOverride: target,
    });
  }) as WeeklyPlan["days"];

  // B2 (#9): Roberto's carb-led tier rule — the kcal surplus of higher
  // training days is allocated as cereal-composition food; adjustments are
  // the visible signal (ride the bundle → assumptions). Overrides bypass.
  const carbLedAdjustments = applyCarbLedTierRule(
    days,
    options.macroOptions?.absoluteOverrides
  );

  const weeklyAverageKcal = Math.round(
    days.reduce((sum, d) => sum + d.macros.totalKcal, 0) / 7
  );
  const weeklyAverageProteinG = Math.round(
    days.reduce((sum, d) => sum + d.macros.proteinG, 0) / 7
  );

  return { days, weeklyAverageKcal, weeklyAverageProteinG, carbLedAdjustments };
}
