/**
 * Invariant: every distinct ingredient foodId used anywhere in ALL_TEMPLATES is
 * mapped in FOOD_MAP and resolves to a defined nutrition object (a real v3 row
 * or the zero-sentinel). No unmapped foodIds, no undefined resolutions.
 *
 * This is the Stage-1 safety net: if a future template adds an ingredient with
 * a new foodId, this test fails until FOOD_MAP covers it.
 */

import { describe, test, expect } from "vitest";
import { ALL_TEMPLATES } from "../templates";
import { FOOD_MAP, resolveFood, type ResolvedFood } from "../food-map";

const distinctFoodIds = [
  ...new Set(
    ALL_TEMPLATES.flatMap((t) => t.ingredients.map((ing) => ing.foodId))
  ),
].sort();

describe("FOOD_MAP coverage of template ingredients", () => {
  test("there are 67 distinct ingredient foodIds across all templates", () => {
    expect(distinctFoodIds.length).toBe(67);
  });

  test("every distinct foodId has a FOOD_MAP entry", () => {
    const unmapped = distinctFoodIds.filter((id) => FOOD_MAP[id] === undefined);
    expect(unmapped).toEqual([]);
  });

  test("every distinct foodId resolves to a defined nutrition object", () => {
    for (const id of distinctFoodIds) {
      const r: ResolvedFood = resolveFood(id);
      expect(r).toBeDefined();
      for (const k of ["kcal", "proteinG", "carbsG", "fatG", "fibreG", "sodiumMg"] as const) {
        expect(typeof r[k]).toBe("number");
        expect(Number.isNaN(r[k])).toBe(false);
      }
      expect(typeof r.category).toBe("string");
      expect(["exact", "sub", "zero"]).toContain(r.via);
    }
  });

  test("zero-sentinel foodIds resolve to all-zero macros", () => {
    const zeroIds = distinctFoodIds.filter((id) => FOOD_MAP[id]?.via === "zero");
    for (const id of zeroIds) {
      const r = resolveFood(id);
      expect(r.kcal + r.proteinG + r.carbsG + r.fatG + r.fibreG + r.sodiumMg).toBe(0);
      expect(r.category).toBe("zero");
    }
  });

  test("unmapped foodId throws", () => {
    expect(() => resolveFood("__definitely_not_a_food__")).toThrow();
  });
});
