/**
 * Guardrail for #18: post-workout meals must not appear on non-training days.
 *
 * SNACK_03 ("Frullato Proteico") keeps an internal `post_workout` tag. The
 * planner drops post_workout-tagged meals from the pool whenever the day-type
 * is not "training" (rest / refeed / deload), so the dedicated post_workout
 * slot in the 6-meal distribution fills with a normal snack instead. On
 * training days the meal remains available.
 *
 * The 6-meal distribution has three snack-type slots and the pool has four
 * snack templates, so every snack slot's primary + substitutions covers all
 * available snacks — making the appear/not-appear assertions deterministic.
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
    mealCount: 6, // the only distribution with a dedicated post_workout slot
    substitutionsPerSlot: 4,
  };
  return shownTemplates(createMealPlan(ALL_TEMPLATES, config).slots);
}

describe("#18 — post-workout meals excluded on non-training days", () => {
  for (const dayType of ["rest", "refeed", "deload"] as DayType[]) {
    test(`no post_workout-tagged meal appears on a ${dayType} day`, () => {
      const shown = build(dayType);
      expect(shown.some((t) => t.tags.includes("post_workout"))).toBe(false);
      expect(shown.some((t) => t.id === "SNACK_03")).toBe(false);
    });
  }

  test("post-workout meal can still appear on a training day", () => {
    const shown = build("training");
    expect(shown.some((t) => t.tags.includes("post_workout"))).toBe(true);
    expect(shown.some((t) => t.id === "SNACK_03")).toBe(true);
  });
});
