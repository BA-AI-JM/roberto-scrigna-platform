/**
 * #16b source pins — engine invariants.
 *
 * A coach may, BEFORE generation, pin which food fills a solver category for a
 * given day-type (e.g. "use cottage cheese for protein on rest days"). The pin is
 * OPT-IN and per-day-type. The hard contract is unchanged:
 *   - a pin changes WHICH food fills a category, NEVER the targets;
 *   - kcal + protein stay PROTECTED ±5% when the pinned food can physically carry
 *     them (a low-density pin may make protein YIELD — that is correct, see the
 *     diag-source-pins.ts realism-limit scenario, and is NOT asserted here);
 *   - an unknown pin id is ignored (never crashes) → the template food is kept;
 *   - ABSENT pins are byte-identical to the pre-#16b behaviour (regression guard).
 */

import { describe, test, expect } from "vitest";
import { createMealPlan } from "../planner";
import { assembleMeal, foodCatalogue, classifyFood } from "../solver";
import type { MealPlanConfig, MealTemplate, SlotMacroTargets, PinnableCategory } from "../types";
import { ALL_TEMPLATES } from "../../../data/meals/templates";
import type { MacroTargets } from "../../types";

const PCT = 5;
const pctDiff = (a: number, t: number) => (t === 0 ? 0 : ((a - t) / t) * 100);

// A high-density protein the templates already use, so the protein target stays
// reachable under the realism bounds — keeps kcal + protein within ±5% when pinned.
const FEASIBLE_PROTEIN = "petto-pollo"; // chicken breast
const REST: MacroTargets = { proteinG: 160, fatG: 60, carbG: 80, totalKcal: 1500, dayType: "rest" };

function plan(config: Partial<MealPlanConfig> & Pick<MealPlanConfig, "dayType" | "macroTargets">) {
  return createMealPlan(ALL_TEMPLATES, {
    mealCount: 4,
    substitutionsPerSlot: 3,
    ...config,
  });
}

/** Collect every PROTEIN-category foodId across a plan's primary meals. */
function proteinFoodIds(p: ReturnType<typeof createMealPlan>): string[] {
  return p.slots.flatMap((s) =>
    s.primary.scaledIngredients.filter((i) => classifyFood(i.foodId) === "PROTEIN").map((i) => i.foodId)
  );
}

// A template that actually contains a PROTEIN-category ingredient, for unit tests.
const proteinTemplate: MealTemplate = ALL_TEMPLATES.find((t) =>
  t.ingredients.some((ing) => classifyFood(ing.foodId) === "PROTEIN")
)!;
const slotTarget: SlotMacroTargets = { kcal: 500, proteinG: 45, fatG: 18, carbsG: 40 };

describe("source pins — pinned food is used (#16b)", () => {
  test("every protein source becomes the pinned food", () => {
    const p = plan({ dayType: "rest", macroTargets: REST, sourcePins: { rest: { PROTEIN: { foodId: FEASIBLE_PROTEIN } } } });
    const ids = proteinFoodIds(p);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id === FEASIBLE_PROTEIN)).toBe(true);
  });

  test("assembleMeal swaps the pinned category at the unit level", () => {
    const pinned = assembleMeal(proteinTemplate, slotTarget, { PROTEIN: { foodId: FEASIBLE_PROTEIN } });
    const protIds = pinned.scaledIngredients.filter((i) => classifyFood(i.foodId) === "PROTEIN").map((i) => i.foodId);
    expect(protIds.length).toBeGreaterThan(0);
    expect(protIds.every((id) => id === FEASIBLE_PROTEIN)).toBe(true);
  });
});

describe("source pins — protected pair holds with a feasible pin (#16b)", () => {
  test("kcal + protein stay within ±5% when the pinned food can carry them", () => {
    const g = plan({ dayType: "rest", macroTargets: REST, sourcePins: { rest: { PROTEIN: { foodId: FEASIBLE_PROTEIN } } } }).actualMacros;
    expect(Math.abs(pctDiff(g.kcal, REST.totalKcal))).toBeLessThanOrEqual(PCT);
    expect(Math.abs(pctDiff(g.proteinG, REST.proteinG))).toBeLessThanOrEqual(PCT);
  });
});

describe("source pins — unknown id is ignored, never crashes (#16b)", () => {
  test("an unknown pin foodId falls back to the template food (byte-identical to OFF)", () => {
    const off = plan({ dayType: "rest", macroTargets: REST });
    let withBogus!: ReturnType<typeof createMealPlan>;
    expect(() => {
      withBogus = plan({ dayType: "rest", macroTargets: REST, sourcePins: { rest: { PROTEIN: { foodId: "not-a-real-food-xyz" } } } });
    }).not.toThrow();
    expect(withBogus.slots).toEqual(off.slots);
  });

  test("assembleMeal with an unknown pin id keeps the template food", () => {
    const baseline = assembleMeal(proteinTemplate, slotTarget);
    const bogus = assembleMeal(proteinTemplate, slotTarget, { PROTEIN: { foodId: "not-a-real-food-xyz" } });
    expect(bogus.scaledIngredients).toEqual(baseline.scaledIngredients);
  });
});

describe("source pins — absent/inert pins are byte-identical (#16b regression)", () => {
  test("omitting sourcePins === passing undefined at the unit level", () => {
    const a = assembleMeal(proteinTemplate, slotTarget);
    const b = assembleMeal(proteinTemplate, slotTarget, undefined);
    expect(b).toEqual(a);
  });

  test("no sourcePins === a pin for a DIFFERENT day-type (never applies)", () => {
    const off = plan({ dayType: "rest", macroTargets: REST });
    const otherDay = plan({ dayType: "rest", macroTargets: REST, sourcePins: { training: { PROTEIN: { foodId: FEASIBLE_PROTEIN } } } });
    expect(otherDay.slots).toEqual(off.slots);
  });

  test("no sourcePins === an empty pin object for this day-type", () => {
    const off = plan({ dayType: "rest", macroTargets: REST });
    const empty = plan({ dayType: "rest", macroTargets: REST, sourcePins: { rest: {} } });
    expect(empty.slots).toEqual(off.slots);
  });
});

describe("food catalogue — grouped, sane, no leakage (#16b)", () => {
  test("every pinnable category is populated and excludes FIXED/zero foods", () => {
    const cat = foodCatalogue();
    const categories: PinnableCategory[] = ["PROTEIN", "CARB", "VEG", "FAT", "FRUIT"];
    for (const c of categories) {
      expect(cat[c].length).toBeGreaterThan(0);
      // Each listed food classifies into its own bucket (no FIXED/mis-bucketed entries).
      for (const { foodId } of cat[c]) expect(classifyFood(foodId)).toBe(c);
    }
    // Sorted by display name within each bucket.
    for (const c of categories) {
      const names = cat[c].map((x) => x.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });
});
