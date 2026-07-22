/**
 * Exercise energy expenditure calculation.
 *
 * Method priority system (spec v4.4 / v4.4.1):
 * 0. Sport Correction Protocol (SCP) — HR zones + sport profile (highest accuracy)
 * 1. Heart rate-based (Keytel formula — average HR, no zone breakdown)
 * 2. MET value × weight × duration
 * 3. Per-session kcal estimate (from trainer)
 * 4. Default 300kcal fallback
 *
 * When scpData is present on the session, SCP is attempted as Method 0.
 * If SCP returns null (Tier 2/3 data), the pipeline falls through to Keytel.
 * SCP results bypass the 0.85 recalibration factor (SCP does its own correction).
 */

import type { Sex, ExerciseSession, ExerciseResult, ExerciseMethod } from "./types";
import { runSCP } from "./sport-correction/index";

// ── v4.4.1 Recalibration ─────────────────────────────────────────────────────

/** Correction factor applied to legacy methods (Keytel, MET, estimate) */
const RECALIBRATION_FACTOR = 0.85;

// ── Method 1: Heart Rate-Based (Keytel) ───────────────────────────────────────

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
 *
 * Method 0 (SCP): When session.scpData is present, the Sport Correction Protocol
 * is attempted first. SCP handles its own correction; no 0.85 factor applied.
 * If SCP returns null (Tier 2/3), falls through to Method 1.
 *
 * Methods 1–4: Apply v4.4.1 recalibration factor (×0.85) to the raw kcal.
 *
 * @param session - Exercise session data with method and parameters
 * @param ctx - Client context (weight, age, sex)
 * @returns Exercise kcal with method used and recalibration factor
 */
export function calculateExercise(
  session: ExerciseSession,
  ctx: ExerciseContext
): ExerciseResult {
  // ── Method 0: Sport Correction Protocol ──────────────────────────────────────
  if (session.scpData != null) {
    const scpResult = runSCP({
      hrZoneData: session.scpData.hrZoneData,
      categoryId: session.scpData.categoryId,
      sessionType: session.scpData.sessionType,
      durationMin: session.durationMin,
      weightKg: ctx.weightKg,
      ageYears: ctx.ageYears,
      sex: ctx.sex,
      deviceKcal: session.scpData.deviceKcal,
      avgHeartRate: session.avgHeartRate,
      metValue: session.metValue,
      kcalEstimate: session.kcalEstimate,
    });

    if (scpResult != null) {
      // SCP succeeded (Tier 1) — return directly, no recalibration factor
      return {
        exerciseKcal: scpResult.exerciseKcal,
        methodUsed: "sport_correction_protocol",
        recalibrationFactor: scpResult.recalibrationFactor,
      };
    }
    // SCP returned null (Tier 2/3) — fall through to legacy methods below
  }

  // ── R15: coach-supplied FINAL kcal — return directly, no recalibration
  // (his manual per-session burn already IS the answer). Mirrors the SCP
  // "return directly" precedent above.
  if (session.finalExerciseKcal != null) {
    return {
      exerciseKcal: Math.round(session.finalExerciseKcal),
      methodUsed: "session_estimate",
      recalibrationFactor: 1,
    };
  }

  // ── Methods 1–4: Legacy path (applies 0.85 recalibration) ────────────────────
  let rawKcal: number;
  let methodUsed: ExerciseMethod;

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
