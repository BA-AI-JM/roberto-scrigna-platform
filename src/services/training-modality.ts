/**
 * Maps the intake training schedule (per-day sessions with modality / duration /
 * RPE) into a representative ExerciseSession the engine can use for training-day
 * energy expenditure — replacing the flat 300 kcal `default_estimate`.
 *
 * MET values come from `src/engine/sport-taxonomy.ts`, which is built from
 * v4.4 spec Appendix D. **Strength training MET is capped at 3 regardless of
 * RPE** (spec rule); other modalities use the entry's base MET with a modest
 * RPE adjustment.
 *
 * Pure, side-effect-free; tested in __tests__/training-modality.test.ts.
 */

import type { ExerciseSession } from "../engine/types";
import {
  findSportEntry,
  FALLBACK_MODALITY,
  type SportEntry,
} from "../engine/sport-taxonomy";

/** Mirrors RECALIBRATION_FACTOR in engine/exercise.ts — MET estimates are
 *  discounted ×0.85; a coach's manual kcal is his real burn and is NOT. */
const MET_RECALIBRATION = 0.85;

/**
 * Legacy display-name mapping. Earlier versions of the intake form used a
 * shorter Italian list (Forza, Ipertrofia, Cardio LISS, …). Existing snapshots
 * still carry those strings, so we translate them to the canonical Appendix D
 * taxonomy at lookup time so old plans keep regenerating correctly.
 */
const LEGACY_DISPLAY_TO_CANONICAL: Record<string, string> = {
  Forza: "Pesi — Forza",
  Ipertrofia: "Pesi — Ipertrofia",
  "Cardio LISS": "Corsa — Costante",
  "Cardio HIIT": "HIIT / Intervalli",
  Crossfit: "CrossFit / WOD",
  "Sport di squadra": "Calcio — Allenamento",
  "Arti marziali": "MMA — Classe (mista)",
  Ciclismo: "Ciclismo",
  Corsa: "Corsa — Costante",
  Nuoto: "Nuoto",
  // "Altro" and "Yoga / Mobilità" intentionally fall through to FALLBACK_MODALITY.
};

export interface IntakeTrainingSession {
  modality?: string;
  duration_min?: number;
  rpe?: number;
  /**
   * B-eng1 / R15 (Roberto 2026-07-22): coach's manual kcal for this session.
   * When present it IS the session's final exercise kcal (his actual measured
   * burn) — used directly, WITHOUT the 0.85 recalibration the MET estimate
   * gets, and it feeds the day's expenditure (no longer display-only).
   */
  kcal_override?: number;
  /**
   * #18 nutrient timing — optional clock time of the session (24h "HH:MM",
   * e.g. "18:00"). Display-only: it powers the timed training-session box +
   * pre/intra/post grouping in the UI. The TDEE engine ignores it (it uses
   * duration_min/modality/rpe), so it never changes the prescription.
   */
  startTime?: string;
  /** #18 — optional session end "HH:MM" (derivable from startTime + duration_min if absent). */
  endTime?: string;
}

/**
 * Resolve a (possibly legacy) display name to a canonical taxonomy entry,
 * falling back to the neutral entry when the name is unrecognised.
 */
export function resolveSportEntry(displayIt: string | undefined | null): SportEntry {
  if (!displayIt) return FALLBACK_MODALITY;
  const direct = findSportEntry(displayIt);
  if (direct) return direct;
  const legacy = LEGACY_DISPLAY_TO_CANONICAL[displayIt];
  if (legacy) {
    const remapped = findSportEntry(legacy);
    if (remapped) return remapped;
  }
  return FALLBACK_MODALITY;
}

/**
 * RPE → MET multiplier. RPE 1 → 0.84×, RPE 5 → 1.0×, RPE 10 → 1.2×.
 *
 * NOT applied to strength entries (the spec caps strength MET at 3 regardless
 * of RPE — that's encoded by SportEntry.rpeAdjusts = false).
 */
export function rpeFactor(rpe: number | undefined): number {
  const r = rpe == null || Number.isNaN(rpe) ? 7 : Math.min(10, Math.max(1, rpe));
  return 0.8 + 0.04 * r;
}

/** Effective MET for a session: entry MET, with RPE adjustment only when allowed. */
export function effectiveMet(
  entry: SportEntry,
  rpe: number | undefined
): number {
  if (!entry.rpeAdjusts) return entry.metGross;
  return entry.metGross * rpeFactor(rpe);
}

/**
 * Build a representative training-day ExerciseSession from per-day intake sessions.
 *
 * For each scheduled "training" day we sum the session minutes and take a
 * duration-weighted MET (each session's MET resolved per the taxonomy rules
 * above); then we average those across all training days. The engine currently
 * models a single "training" day-type, so a single representative session is
 * the best fit until per-day day-types land.
 *
 * @param sessionsByDay  Record keyed by weekday index "0".."6" → array of sessions.
 * @param weekSchedule   The 7-element day-type schedule (Mon..Sun).
 * @returns A `met_value` ExerciseSession, or null when there's no usable data
 *          (caller should then let the engine use its default).
 */
function anyOverride(sessions: IntakeTrainingSession[]): boolean {
  return sessions.some((s) => s.kcal_override != null);
}

/** A day's FINAL exercise kcal: manual override as-is (his real burn) + MET
 *  sessions recalibrated ×0.85. Needs bodyweight for the MET part. */
function dayFinalKcal(sessions: IntakeTrainingSession[], weightKg: number): { minutes: number; kcal: number } {
  let minutes = 0;
  let kcal = 0;
  for (const s of sessions) {
    const min = Math.min(480, Math.max(1, Number(s.duration_min) || 60));
    minutes += min;
    if (s.kcal_override != null) {
      kcal += s.kcal_override; // final — no recalibration
    } else {
      const met = effectiveMet(resolveSportEntry(s.modality), s.rpe);
      kcal += met * weightKg * (min / 60) * MET_RECALIBRATION;
    }
  }
  return { minutes, kcal };
}

export function buildTrainingSessionFromIntake(
  sessionsByDay: Record<string, IntakeTrainingSession[]> | undefined | null,
  weekSchedule: readonly string[],
  weightKg?: number
): ExerciseSession | null {
  if (!sessionsByDay) return null;

  const trainingDays: IntakeTrainingSession[][] = [];
  for (let i = 0; i < weekSchedule.length; i++) {
    if (weekSchedule[i] !== "training") continue;
    const sessions = sessionsByDay[String(i)];
    if (sessions && sessions.length > 0) trainingDays.push(sessions);
  }
  if (trainingDays.length === 0) return null;

  // R15: if any session carries a manual kcal AND we know bodyweight, the
  // representative day is the AVERAGE of each training day's FINAL kcal
  // (override-aware, recalibration-correct). Returned as a final-kcal session
  // so calculateExercise uses it directly. Otherwise: unchanged MET path.
  if (weightKg != null && trainingDays.some(anyOverride)) {
    const finals = trainingDays.map((d) => dayFinalKcal(d, weightKg));
    const avgMinutes = Math.round(finals.reduce((a, d) => a + d.minutes, 0) / finals.length);
    const avgKcal = Math.round((finals.reduce((a, d) => a + d.kcal, 0) / finals.length) * 10) / 10;
    return { method: "session_estimate", durationMin: avgMinutes, finalExerciseKcal: avgKcal };
  }

  const perDay: Array<{ minutes: number; weightedMet: number }> = [];
  for (const sessions of trainingDays) {
    let totalMin = 0;
    let metMinSum = 0;
    for (const s of sessions) {
      const minutes = Math.min(480, Math.max(1, Number(s.duration_min) || 60));
      totalMin += minutes;
      metMinSum += effectiveMet(resolveSportEntry(s.modality), s.rpe) * minutes;
    }
    if (totalMin > 0) perDay.push({ minutes: totalMin, weightedMet: metMinSum / totalMin });
  }
  if (perDay.length === 0) return null;

  const avgMinutes = Math.round(perDay.reduce((sum, d) => sum + d.minutes, 0) / perDay.length);
  const avgMet =
    Math.round((perDay.reduce((sum, d) => sum + d.weightedMet, 0) / perDay.length) * 10) / 10;
  return { method: "met_value", durationMin: avgMinutes, metValue: avgMet };
}

/**
 * Build an ExerciseSession from a single day's intake sessions, using the
 * same modality-resolution + duration-weighted-MET rules as
 * buildTrainingSessionFromIntake but scoped to one day. Returns null for
 * an empty session list — caller decides whether to fall back to the
 * weekly default or treat the day as a rest day.
 */
export function buildTrainingSessionForDay(
  sessions: IntakeTrainingSession[] | undefined | null,
  weightKg?: number
): ExerciseSession | null {
  if (!sessions || sessions.length === 0) return null;

  // R15: manual kcal present + bodyweight known → final-kcal session (direct,
  // no recalibration). Otherwise unchanged MET path (byte-identical).
  if (weightKg != null && anyOverride(sessions)) {
    const { minutes, kcal } = dayFinalKcal(sessions, weightKg);
    if (minutes <= 0) return null;
    return { method: "session_estimate", durationMin: minutes, finalExerciseKcal: Math.round(kcal * 10) / 10 };
  }

  let totalMin = 0;
  let metMinSum = 0;
  for (const s of sessions) {
    const minutes = Math.min(480, Math.max(1, Number(s.duration_min) || 60));
    totalMin += minutes;
    metMinSum += effectiveMet(resolveSportEntry(s.modality), s.rpe) * minutes;
  }
  if (totalMin <= 0) return null;
  const avgMet = Math.round((metMinSum / totalMin) * 10) / 10;
  return { method: "met_value", durationMin: totalMin, metValue: avgMet };
}
