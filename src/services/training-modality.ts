/**
 * Maps the intake training schedule (per-day sessions with modality / duration /
 * RPE) into a representative ExerciseSession the engine can use for training-day
 * energy expenditure — replacing the flat 300 kcal `default_estimate`.
 *
 * Pure, side-effect-free; tested in __tests__/training-modality.test.ts.
 */

import type { ExerciseSession } from "../engine/types";

/**
 * Approximate gross MET values for the intake training modalities
 * (Compendium-of-Physical-Activities-ish; intentionally conservative).
 */
export const MODALITY_MET: Record<string, number> = {
  Forza: 5.0,
  Ipertrofia: 5.0,
  "Cardio LISS": 5.0,
  "Cardio HIIT": 8.0,
  Crossfit: 8.0,
  "Yoga / Mobilità": 2.5,
  "Sport di squadra": 7.0,
  "Arti marziali": 10.0,
  Ciclismo: 7.5,
  Corsa: 9.8,
  Nuoto: 7.0,
  Altro: 5.0,
};

export const DEFAULT_MODALITY_MET = 5.0;

export interface IntakeTrainingSession {
  modality?: string;
  duration_min?: number;
  rpe?: number;
}

/** RPE → MET multiplier. RPE 1 → 0.84×, RPE 5 → 1.0×, RPE 10 → 1.2×. */
export function rpeFactor(rpe: number | undefined): number {
  const r = rpe == null || Number.isNaN(rpe) ? 7 : Math.min(10, Math.max(1, rpe));
  return 0.8 + 0.04 * r;
}

/** MET for a single modality, with the conservative default fallback. */
export function modalityMet(modality: string | undefined): number {
  return MODALITY_MET[modality ?? ""] ?? DEFAULT_MODALITY_MET;
}

/**
 * Build a representative training-day ExerciseSession from per-day intake sessions.
 *
 * For each scheduled "training" day we sum the session minutes and take a
 * duration-weighted, RPE-adjusted average MET; then we average those across all
 * training days. The engine currently models a single "training" day-type, so a
 * single representative session is the best fit until per-day day-types land.
 *
 * @param sessionsByDay  Record keyed by weekday index "0".."6" → array of sessions.
 * @param weekSchedule   The 7-element day-type schedule (Mon..Sun).
 * @returns A `met_value` ExerciseSession, or null when there's no usable data
 *          (caller should then let the engine use its default).
 */
export function buildTrainingSessionFromIntake(
  sessionsByDay: Record<string, IntakeTrainingSession[]> | undefined | null,
  weekSchedule: readonly string[]
): ExerciseSession | null {
  if (!sessionsByDay) return null;

  const perDay: Array<{ minutes: number; weightedMet: number }> = [];
  for (let i = 0; i < weekSchedule.length; i++) {
    if (weekSchedule[i] !== "training") continue;
    const sessions = sessionsByDay[String(i)];
    if (!sessions || sessions.length === 0) continue;

    let totalMin = 0;
    let metMinSum = 0;
    for (const s of sessions) {
      const minutes = Math.min(480, Math.max(1, Number(s.duration_min) || 60));
      totalMin += minutes;
      metMinSum += modalityMet(s.modality) * rpeFactor(s.rpe) * minutes;
    }
    if (totalMin > 0) perDay.push({ minutes: totalMin, weightedMet: metMinSum / totalMin });
  }

  if (perDay.length === 0) return null;

  const avgMinutes = Math.round(perDay.reduce((sum, d) => sum + d.minutes, 0) / perDay.length);
  const avgMet =
    Math.round((perDay.reduce((sum, d) => sum + d.weightedMet, 0) / perDay.length) * 10) / 10;

  return { method: "met_value", durationMin: avgMinutes, metValue: avgMet };
}
