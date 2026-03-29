/**
 * Macro distribution templates for 3-6 meals per day.
 * Each template defines how daily macros are split across meal slots.
 */

import type { DistributionTemplate, SlotAllocation } from "./types";

// ── 3-Meal Distribution ─────────────────────────────────────────────────────

const THREE_MEAL_SLOTS: SlotAllocation[] = [
  {
    slot: "breakfast",
    validTypes: ["breakfast"],
    kcalFraction: 0.3,
    proteinFraction: 0.3,
    fatFraction: 0.3,
    carbsFraction: 0.3,
  },
  {
    slot: "lunch",
    validTypes: ["lunch"],
    kcalFraction: 0.4,
    proteinFraction: 0.4,
    fatFraction: 0.35,
    carbsFraction: 0.4,
  },
  {
    slot: "dinner",
    validTypes: ["dinner"],
    kcalFraction: 0.3,
    proteinFraction: 0.3,
    fatFraction: 0.35,
    carbsFraction: 0.3,
  },
];

// ── 4-Meal Distribution ─────────────────────────────────────────────────────

const FOUR_MEAL_SLOTS: SlotAllocation[] = [
  {
    slot: "breakfast",
    validTypes: ["breakfast"],
    kcalFraction: 0.25,
    proteinFraction: 0.25,
    fatFraction: 0.25,
    carbsFraction: 0.25,
  },
  {
    slot: "lunch",
    validTypes: ["lunch"],
    kcalFraction: 0.3,
    proteinFraction: 0.3,
    fatFraction: 0.3,
    carbsFraction: 0.3,
  },
  {
    slot: "snack",
    validTypes: ["snack"],
    kcalFraction: 0.15,
    proteinFraction: 0.15,
    fatFraction: 0.15,
    carbsFraction: 0.15,
  },
  {
    slot: "dinner",
    validTypes: ["dinner"],
    kcalFraction: 0.3,
    proteinFraction: 0.3,
    fatFraction: 0.3,
    carbsFraction: 0.3,
  },
];

// ── 5-Meal Distribution ─────────────────────────────────────────────────────

const FIVE_MEAL_SLOTS: SlotAllocation[] = [
  {
    slot: "breakfast",
    validTypes: ["breakfast"],
    kcalFraction: 0.2,
    proteinFraction: 0.2,
    fatFraction: 0.2,
    carbsFraction: 0.2,
  },
  {
    slot: "snack_1",
    validTypes: ["snack"],
    kcalFraction: 0.1,
    proteinFraction: 0.1,
    fatFraction: 0.1,
    carbsFraction: 0.1,
  },
  {
    slot: "lunch",
    validTypes: ["lunch"],
    kcalFraction: 0.3,
    proteinFraction: 0.3,
    fatFraction: 0.3,
    carbsFraction: 0.3,
  },
  {
    slot: "snack_2",
    validTypes: ["snack"],
    kcalFraction: 0.1,
    proteinFraction: 0.1,
    fatFraction: 0.1,
    carbsFraction: 0.1,
  },
  {
    slot: "dinner",
    validTypes: ["dinner"],
    kcalFraction: 0.3,
    proteinFraction: 0.3,
    fatFraction: 0.3,
    carbsFraction: 0.3,
  },
];

// ── 6-Meal Distribution ─────────────────────────────────────────────────────

const SIX_MEAL_SLOTS: SlotAllocation[] = [
  {
    slot: "breakfast",
    validTypes: ["breakfast"],
    kcalFraction: 0.18,
    proteinFraction: 0.18,
    fatFraction: 0.18,
    carbsFraction: 0.18,
  },
  {
    slot: "snack_1",
    validTypes: ["snack"],
    kcalFraction: 0.1,
    proteinFraction: 0.1,
    fatFraction: 0.1,
    carbsFraction: 0.1,
  },
  {
    slot: "lunch",
    validTypes: ["lunch"],
    kcalFraction: 0.25,
    proteinFraction: 0.25,
    fatFraction: 0.25,
    carbsFraction: 0.25,
  },
  {
    slot: "snack_2",
    validTypes: ["snack", "pre_workout"],
    kcalFraction: 0.1,
    proteinFraction: 0.1,
    fatFraction: 0.1,
    carbsFraction: 0.1,
  },
  {
    slot: "post_workout",
    validTypes: ["snack", "post_workout"],
    kcalFraction: 0.12,
    proteinFraction: 0.12,
    fatFraction: 0.07,
    carbsFraction: 0.15,
  },
  {
    slot: "dinner",
    validTypes: ["dinner"],
    kcalFraction: 0.25,
    proteinFraction: 0.25,
    fatFraction: 0.3,
    carbsFraction: 0.22,
  },
];

// ── All Templates ───────────────────────────────────────────────────────────

/** Built-in distribution templates indexed by meal count */
export const DISTRIBUTION_TEMPLATES: Record<number, DistributionTemplate> = {
  3: { mealCount: 3, label: "3 pasti", slots: THREE_MEAL_SLOTS },
  4: { mealCount: 4, label: "4 pasti", slots: FOUR_MEAL_SLOTS },
  5: { mealCount: 5, label: "5 pasti", slots: FIVE_MEAL_SLOTS },
  6: { mealCount: 6, label: "6 pasti", slots: SIX_MEAL_SLOTS },
};

/**
 * Get the distribution template for a given meal count.
 * Falls back to 4-meal template if count is not 3-6.
 */
export function getDistribution(mealCount: number): DistributionTemplate {
  const clamped = Math.max(3, Math.min(6, mealCount));
  return DISTRIBUTION_TEMPLATES[clamped] ?? DISTRIBUTION_TEMPLATES[4]!;
}
