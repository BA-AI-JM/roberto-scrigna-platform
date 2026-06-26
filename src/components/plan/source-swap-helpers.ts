/**
 * Pure helpers for the #16b source-swap card (coach picks WHICH food fills a
 * solver category in the generate wizard). Kept separate from the React
 * component so the payload logic is unit-testable in the node-only vitest env.
 *
 * UX decision — GLOBAL, not per-day-type: a coach sets one source per category
 * ("use chicken for protein") and it applies to every day-type. The backend
 * `sourcePins` is per-day-type (`Partial<Record<DayType, SourcePin>>`), so the
 * global selection is replicated across the schedule's present day-types. An
 * all-"Automatico" card produces `undefined` → NO sourcePins sent → byte-identical
 * to today's behaviour (the engine regression test depends on absent pins).
 */

import type { DayType } from "../../engine/types";
import type { PinnableCategory, SourcePin } from "../../engine/meal-plan/types";

/** Pinnable categories in display order, with Italian labels. */
export const PINNABLE_CATEGORIES: { key: PinnableCategory; label: string }[] = [
  { key: "PROTEIN", label: "Proteine" },
  { key: "CARB", label: "Carboidrati" },
  { key: "FAT", label: "Grassi" },
  { key: "VEG", label: "Verdura" },
  { key: "FRUIT", label: "Frutta" },
];

/**
 * Sentinel Select value for the "Automatico" (no pin) option. Radix Select
 * forbids an empty-string item value, so we use a sentinel and map it back to ""
 * (the card's "no pin" state) on change.
 */
export const AUTO_VALUE = "__auto__";

/** Per-category selected foodId. "" (or AUTO_VALUE) means "no pin — engine chooses". */
export type SourceSwapSelections = Record<PinnableCategory, string>;

/** All-Automatico starting state. */
export const EMPTY_SELECTIONS: SourceSwapSelections = {
  PROTEIN: "",
  CARB: "",
  FAT: "",
  VEG: "",
  FRUIT: "",
};

/** True when at least one category has a real pin (not Automatico). */
export function hasAnyPin(selections: SourceSwapSelections): boolean {
  return PINNABLE_CATEGORIES.some(({ key }) => {
    const v = selections[key];
    return v !== "" && v !== AUTO_VALUE;
  });
}

/**
 * Build the per-day-type `sourcePins` payload from the GLOBAL category selections,
 * applied to every present day-type. Returns `undefined` when nothing is pinned
 * (or no day-types are present) — so an all-Automatico card sends NO sourcePins.
 */
export function buildSourcePinsPayload(
  selections: SourceSwapSelections,
  presentDayTypes: DayType[]
): Partial<Record<DayType, SourcePin>> | undefined {
  const pin: SourcePin = {};
  for (const { key } of PINNABLE_CATEGORIES) {
    const foodId = selections[key];
    if (foodId && foodId !== AUTO_VALUE) pin[key] = { foodId };
  }
  if (Object.keys(pin).length === 0) return undefined;

  const days = Array.from(new Set(presentDayTypes));
  if (days.length === 0) return undefined;

  const out: Partial<Record<DayType, SourcePin>> = {};
  for (const dt of days) out[dt] = { ...pin };
  return out;
}
