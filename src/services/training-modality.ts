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
      const entry = resolveSportEntry(s.modality);
      totalMin += minutes;
      metMinSum += effectiveMet(entry, s.rpe) * minutes;
    }
    if (totalMin > 0) perDay.push({ minutes: totalMin, weightedMet: metMinSum / totalMin });
  }

  if (perDay.length === 0) return null;

  const avgMinutes = Math.round(perDay.reduce((sum, d) => sum + d.minutes, 0) / perDay.length);
  const avgMet =
    Math.round((perDay.reduce((sum, d) => sum + d.weightedMet, 0) / perDay.length) * 10) / 10;

  return { method: "met_value", durationMin: avgMinutes, metValue: avgMet };
}
