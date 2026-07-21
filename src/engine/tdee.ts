/**
 * Total Daily Energy Expenditure (TDEE) calculation.
 *
 * TDEE = BMR + NEAT + Exercise + TEF
 * TEF = 10% of BMR (not total expenditure)
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

/**
 * #17 periodization tiers — provisional DEFAULT sessions per intensity tier.
 * Used ONLY when no explicit per-day session is supplied; real generation threads
 * the coach's session via `options.trainingSession`, so intensity flows from the
 * actual session inputs (MET/HR/SCP/duration). The rising kcal estimates order
 * the tiers light < medium < intense < double so modes 3-4 differentiate out of
 * the box. `training_double` approximates a two-session day via higher duration +
 * kcal (a true second session would sum two ExerciseSessions).
 * provisional — Roberto to calibrate intensity defaults
 */
const DEFAULT_TIER_SESSIONS: Record<
  "training_light" | "training_medium" | "training_intense" | "training_double",
  ExerciseSession
> = {
  training_light: { method: "session_estimate", durationMin: 45, kcalEstimate: 200 },
  training_medium: { method: "session_estimate", durationMin: 60, kcalEstimate: 350 },
  training_intense: { method: "session_estimate", durationMin: 75, kcalEstimate: 500 },
  training_double: { method: "session_estimate", durationMin: 120, kcalEstimate: 700 },
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
  /**
   * #26 injury/stress — multiplier on the day's TOTAL TDEE (recovery cost).
   * Absent / 1 = no effect (byte-identical). e.g. 1.1 = +10% for high stress.
   * provisional — Roberto to calibrate.
   */
  stressFactor?: number;
  /**
   * #26 injury/stress — when set, replaces snapshot.dailySteps as the NEAT step
   * input (a reduced-activity day, e.g. broken foot → fewer steps → lower NEAT).
   * Absent = use snapshot.dailySteps (byte-identical). 0 is a valid value.
   */
  reducedActivitySteps?: number;
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
  // #26 injury/stress levers. Absent → byte-identical: stress=1 (no-op) and
  // NEAT steps fall back to snapshot.dailySteps. provisional — Roberto to calibrate.
  const stressFactor = options.stressFactor ?? 1;
  const neatSteps = options.reducedActivitySteps ?? snapshot.dailySteps;

  // Check for manual override first
  const override = options.overrides?.find((o) => o.dayType === dayType);
  if (override) {
    // Still calculate components for informational purposes
    const bodyFatResult = estimateBodyFat(snapshot);
    const bmr = calculateBmr(bodyFatResult, { weightKg: snapshot.weightKg, heightCm: snapshot.heightCm, ageYears: snapshot.ageYears, sex: snapshot.sex });
    const neat = calculateNeat(neatSteps, snapshot.weightKg, snapshot.occupationalLevel);
    const exercise = restDayExercise();
    const tef = calculateTef(bmr.bmrKcal, options.dietEmphasis);

    return {
      bmr,
      neat,
      tef,
      exercise,
      totalTdeeKcal: stressFactor === 1 ? override.tdeeKcal : Math.round(override.tdeeKcal * stressFactor),
      dayType,
    };
  }

  // 1. Body composition & BMR
  const bodyFatResult = estimateBodyFat(snapshot);
  const bmr = calculateBmr(bodyFatResult, { weightKg: snapshot.weightKg, heightCm: snapshot.heightCm, ageYears: snapshot.ageYears, sex: snapshot.sex });

  // 2. NEAT (neatSteps = reducedActivitySteps when set, else snapshot.dailySteps)
  const neat = calculateNeat(
    neatSteps,
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
    // #17 intensity tiers — route through calculateExercise like a training day.
    // The coach's per-day session (options.trainingSession) wins; otherwise the
    // provisional per-tier default supplies rising expenditure by intensity.
    case "training_light":
    case "training_medium":
    case "training_intense":
    case "training_double":
      exercise = calculateExercise(
        options.trainingSession ?? DEFAULT_TIER_SESSIONS[dayType],
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

  // 4. TEF (calculated on BMR only — 10% of resting metabolic rate)
  const subtotal = bmr.bmrKcal + neat.totalNeatKcal + exercise.exerciseKcal;
  const tef = calculateTef(bmr.bmrKcal, options.dietEmphasis);

  // 5. Total (× stressFactor; stress=1 is the exact original expression → byte-identical)
  const rawTotalTdeeKcal = subtotal + tef.tefKcal;
  const totalTdeeKcal =
    stressFactor === 1 ? rawTotalTdeeKcal : Math.round(rawTotalTdeeKcal * stressFactor);

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
