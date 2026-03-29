/**
 * Exercise energy expenditure calculation.
 *
 * 4-method priority system (spec v4.4):
 * 1. Heart rate-based (most accurate when data available)
 * 2. MET value × weight × duration
 * 3. Per-session kcal estimate (from trainer)
 * 4. Default 300kcal fallback
 *
 * v4.4.1 recalibration: Apply a 0.85 correction factor to all methods
 * to account for systematic overestimation in wearable devices and MET tables.
 */

import type { Sex, ExerciseSession, ExerciseResult, ExerciseMethod } from "./types";

// ── v4.4.1 Recalibration ─────────────────────────────────────────────────────

/** Correction factor to reduce overestimation (v4.4.1 update) */
const RECALIBRATION_FACTOR = 0.85;

// ── Method 1: Heart Rate-Based ────────────────────────────────────────────────

/**
 * Keytel et al. (2005) HR-based energy expenditure.
 * Male:   kcal/min = (-55.0969 + 0.6309×HR + 0.1988×weight + 0.2017×age) / 4.184
 * Female: kcal/min = (-20.4022 + 0.4472×HR - 0.1263×weight + 0.074×age) / 4.184
 */
function heartRateKcal(
  avgHR: number,
  weightKg: number,
  ageYears: number,
  sex: Sex,
  durationMin: number
): number {
  let kcalPerMin: number;
  if (sex === "male") {
    kcalPerMin =
      (-55.0969 + 0.6309 * avgHR + 0.1988 * weightKg + 0.2017 * ageYears) / 4.184;
  } else {
    kcalPerMin =
      (-20.4022 + 0.4472 * avgHR - 0.1263 * weightKg + 0.074 * ageYears) / 4.184;
  }
  return Math.max(0, kcalPerMin * durationMin);
}

// ── Method 2: MET-Based ───────────────────────────────────────────────────────

/**
 * MET-based energy expenditure.
 * kcal = MET × weight(kg) × duration(hours)
 */
function metKcal(metValue: number, weightKg: number, durationMin: number): number {
  return metValue * weightKg * (durationMin / 60);
}

// ── Method 3: Session Estimate ────────────────────────────────────────────────

// Direct kcal value — no calculation needed, just pass through.

// ── Method 4: Default ─────────────────────────────────────────────────────────

const DEFAULT_SESSION_KCAL = 300;

// ── Public API ────────────────────────────────────────────────────────────────

export interface ExerciseContext {
  weightKg: number;
  ageYears: number;
  sex: Sex;
}

/**
 * Calculate exercise energy expenditure using the highest-priority available method.
 * Applies v4.4.1 recalibration factor to the result.
 *
 * @param session - Exercise session data with method and parameters
 * @param ctx - Client context (weight, age, sex)
 * @returns Exercise kcal with method used and recalibration factor
 */
export function calculateExercise(
  session: ExerciseSession,
  ctx: ExerciseContext
): ExerciseResult {
  let rawKcal: number;
  let methodUsed: ExerciseMethod;

  // Use the specified method, falling through priority if data is missing
  if (session.method === "heart_rate" && session.avgHeartRate != null) {
    rawKcal = heartRateKcal(
      session.avgHeartRate,
      ctx.weightKg,
      ctx.ageYears,
      ctx.sex,
      session.durationMin
    );
    methodUsed = "heart_rate";
  } else if (
    (session.method === "heart_rate" || session.method === "met_value") &&
    session.metValue != null
  ) {
    rawKcal = metKcal(session.metValue, ctx.weightKg, session.durationMin);
    methodUsed = "met_value";
  } else if (
    (session.method === "heart_rate" ||
      session.method === "met_value" ||
      session.method === "session_estimate") &&
    session.kcalEstimate != null
  ) {
    rawKcal = session.kcalEstimate;
    methodUsed = "session_estimate";
  } else {
    rawKcal = DEFAULT_SESSION_KCAL;
    methodUsed = "default_estimate";
  }

  const exerciseKcal = Math.round(rawKcal * RECALIBRATION_FACTOR);

  return {
    exerciseKcal,
    methodUsed,
    recalibrationFactor: RECALIBRATION_FACTOR,
  };
}

/**
 * Calculate exercise kcal for a rest day (no exercise session).
 */
export function restDayExercise(): ExerciseResult {
  return {
    exerciseKcal: 0,
    methodUsed: "default_estimate",
    recalibrationFactor: RECALIBRATION_FACTOR,
  };
}
