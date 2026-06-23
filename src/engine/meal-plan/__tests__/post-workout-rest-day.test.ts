/**
 * Intent guard for #18 (revised): a protein shake may appear on ANY day type.
 *
 * Roberto clarified the problem was NAMING, not inclusion — a shake on a
 * no-workout day is fine, it just must not be *labelled* "post-workout". The
 * generic rename (SNACK_03 → "Frullato Proteico") + neutralised slot labels
 * handle that. The earlier rest-day EXCLUSION over-corrected and was reverted,
 * so post_workout-tagged meals are eligible on training, rest, refeed and
 * deload alike.
 *
 * This test replaces the previous exclusion guard: it asserts the post_workout-
 * tagged meal (SNACK_03) IS eligible on non-training days, so the exclusion
 * doesn't get reintroduced by accident. The 6-meal distribution has three
 * snack-type slots and the pool has four snack templates, so every snack slot's
 * primary + substitutions covers all snacks — making the assertion deterministic.
 */

import { describe, test, expect } from "vitest";
import { createMealPlan } from "../planner";
import type { MealPlanConfig, MealTemplate } from "../types";
import type { DayType, MacroTargets } from "../../types";
import { ALL_TEMPLATES } from "../../../data/meals/templates";

function macros(dayType: DayType): MacroTargets {
  const proteinG = 165;
  const fatG = 70;
  const carbG = 230;
  return { proteinG, fatG, carbG, totalKcal: proteinG * 4 + carbG * 4 + fatG * 9, dayType };
}

/** Every template shown to the user: each slot's primary + its substitutions. */
function shownTemplates(slots: { primary: { template: MealTemplate }; substitutions: { template: MealTemplate }[] }[]): MealTemplate[] {
  const out: MealTemplate[] = [];
  for (const slot of slots) {
    out.push(slot.primary.template);
    for (const sub of slot.substitutions) out.push(sub.template);
  }
  return out;
}

function build(dayType: DayType) {
  const config: MealPlanConfig = {
    dayType,
    macroTargets: macros(dayType),
    mealCount: 6, // distribution with the most snack slots
    substitutionsPerSlot: 4,
  };
  return shownTemplates(createMealPlan(ALL_TEMPLATES, config).slots);
}

describe("#18 — post-workout meals are eligible on all day types (exclusion reverted)", () => {
  for (const dayType of ["training", "rest", "refeed", "deload"] as DayType[]) {
    test(`post_workout-tagged meal can appear on a ${dayType} day`, () => {
      const shown = build(dayType);
      expect(shown.some((t) => t.id === "SNACK_03")).toBe(true);
      expect(shown.some((t) => t.tags.includes("post_workout"))).toBe(true);
    });
  }
});
