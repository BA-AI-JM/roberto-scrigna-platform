/**
 * #17 Stage B — periodization mode presets for the generate wizard.
 *
 * Each mode sets the week's day-type VOCABULARY (a DayType[7]); the coach can
 * still fine-tune individual days afterwards. Modes 3-4 use the #17 intensity
 * tiers (training_light/medium/intense/double) shipped in Stage A.
 *
 * Pure data + a deep-equal "which mode is currently active" helper — kept out of
 * the page so it's unit-testable in the node-only vitest env.
 */

import type { DayType } from "../../engine/types";

export interface PeriodizationMode {
  id: string;
  /** Short Italian label for the selector. */
  label: string;
  /** One-line hint shown under the label. */
  hint: string;
  /** The 7-day vocabulary this mode applies (Mon→Sun). */
  schedule: DayType[];
}

export const PERIODIZATION_MODES: PeriodizationMode[] = [
  {
    id: "weekly-average",
    label: "Media settimanale",
    hint: "Stesso apporto ogni giorno",
    schedule: ["training", "training", "training", "training", "training", "training", "training"],
  },
  {
    id: "train-rest",
    label: "ON / OFF",
    hint: "Apporto più alto nei giorni ON (media del dispendio dei giorni di allenamento)",
    schedule: ["training", "rest", "training", "rest", "training", "training", "rest"],
  },
  // B3 (#6) FINAL (Roberto 2026-07-21): tier ladder is Leggero→Medio (→Intenso
  // in mode 4) — the old medio/intenso pairing predates his answer.
  {
    id: "off-light-medium",
    label: "OFF / leggero / medio",
    hint: "Riposo + due livelli di intensità",
    schedule: [
      "rest",
      "training_light",
      "training_medium",
      "rest",
      "training_light",
      "training_medium",
      "rest",
    ],
  },
  {
    id: "full-tiers",
    label: "OFF / leggero / medio / intenso",
    hint: "Periodizzazione completa a livelli",
    schedule: [
      "rest",
      "training_light",
      "training_medium",
      "training_intense",
      "training_double",
      "training_medium",
      "rest",
    ],
  },
];

/** Deep-equal two day-type schedules. */
function sameSchedule(a: readonly DayType[], b: readonly DayType[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

/**
 * The id of the mode whose schedule exactly matches the current week, or null
 * when the coach has fine-tuned into a non-preset arrangement.
 */
export function activeModeId(weekSchedule: readonly DayType[] | null | undefined): string | null {
  if (!weekSchedule || weekSchedule.length === 0) return null;
  const match = PERIODIZATION_MODES.find((m) => sameSchedule(m.schedule, weekSchedule));
  return match ? match.id : null;
}
