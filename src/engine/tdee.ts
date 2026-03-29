/**
 * Total Daily Energy Expenditure (TDEE) calculation.
 *
 * TDEE = BMR + NEAT + Exercise + TEF
 *
 * Calculated per day-type (training, rest, refeed, deload) with
 * support for manual overrides per day-type.
 */

import type {
  ClientSnapshot,
  DayType,
  ExerciseSession,
  TdeeResult,
  TdeeOverride,
} from "./types";
import { estimateBodyFat } from "./body-fat";
import { calculateBmr } from "./bmr";
import { calculateNeat } from "./neat";
import { calculateExercise, restDayExercise } from "./exercise";
import { calculateTef, type DietEmphasis } from "./tef";

// ── Default Exercise Sessions by Day Type ─────────────────────────────────────

const DEFAULT_TRAINING_SESSION: ExerciseSession = {
  method: "default_estimate",
  durationMin: 60,
};

// ── Public API ────────────────────────────────────────────────────────────────

export interface TdeeOptions {
  /** Exercise session for training days (uses default 300kcal if not provided) */
  trainingSession?: ExerciseSession;
  /** Exercise session for deload days (reduced intensity) */
  deloadSession?: ExerciseSession;
  /** Diet emphasis affects TEF calculation */
  dietEmphasis?: DietEmphasis;
  /** Manual TDEE overrides per day-type */
  overrides?: TdeeOverride[];
}

/**
 * Calculate TDEE for a specific day type.
 *
 * @param snapshot - Client snapshot with all measurements
 * @param dayType - Type of day (training, rest, refeed, deload)
 * @param options - Optional exercise sessions, diet emphasis, and overrides
 * @returns Full TDEE breakdown
 */
export function calculateTdee(
  snapshot: ClientSnapshot,
  dayType: DayType,
  options: TdeeOptions = {}
): TdeeResult {
  // Check for manual override first
  const override = options.overrides?.find((o) => o.dayType === dayType);
  if (override) {
    // Still calculate components for informational purposes
    const bodyFatResult = estimateBodyFat(snapshot);
    const bmr = calculateBmr(bodyFatResult);
    const neat = calculateNeat(snapshot.dailySteps, snapshot.weightKg, snapshot.occupationalLevel);
    const exercise = restDayExercise();
    const tef = calculateTef(bmr.bmrKcal + neat.totalNeatKcal, options.dietEmphasis);

    return {
      bmr,
      neat,
      tef,
      exercise,
      totalTdeeKcal: override.tdeeKcal,
      dayType,
    };
  }

  // 1. Body composition & BMR
  const bodyFatResult = estimateBodyFat(snapshot);
  const bmr = calculateBmr(bodyFatResult);

  // 2. NEAT
  const neat = calculateNeat(
    snapshot.dailySteps,
    snapshot.weightKg,
    snapshot.occupationalLevel
  );

  // 3. Exercise (varies by day type)
  let exercise;
  switch (dayType) {
    case "training":
      exercise = calculateExercise(
        options.trainingSession ?? DEFAULT_TRAINING_SESSION,
        {
          weightKg: snapshot.weightKg,
          ageYears: snapshot.ageYears,
          sex: snapshot.sex,
        }
      );
      break;
    case "deload":
      exercise = options.deloadSession
        ? calculateExercise(options.deloadSession, {
            weightKg: snapshot.weightKg,
            ageYears: snapshot.ageYears,
            sex: snapshot.sex,
          })
        : calculateExercise(
            { method: "session_estimate", durationMin: 45, kcalEstimate: 200 },
            {
              weightKg: snapshot.weightKg,
              ageYears: snapshot.ageYears,
              sex: snapshot.sex,
            }
          );
      break;
    case "rest":
    case "refeed":
    default:
      exercise = restDayExercise();
      break;
  }

  // 4. TEF (calculated on subtotal of BMR + NEAT + Exercise)
  const subtotal = bmr.bmrKcal + neat.totalNeatKcal + exercise.exerciseKcal;
  const tef = calculateTef(subtotal, options.dietEmphasis);

  // 5. Total
  const totalTdeeKcal = subtotal + tef.tefKcal;

  return {
    bmr,
    neat,
    tef,
    exercise,
    totalTdeeKcal,
    dayType,
  };
}

/**
 * Calculate TDEE for all 7 days in the client's week schedule.
 */
export function calculateWeeklyTdee(
  snapshot: ClientSnapshot,
  options: TdeeOptions = {}
): TdeeResult[] {
  return snapshot.weekSchedule.map((dayType) =>
    calculateTdee(snapshot, dayType, options)
  );
}
