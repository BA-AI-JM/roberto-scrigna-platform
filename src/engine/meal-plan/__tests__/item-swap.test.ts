/**
 * #20 coach item-level food swap — engine invariants.
 *
 * A coach replaces ONE ingredient in a generated meal with a SAME-CATEGORY
 * alternative; grams are recomputed ITEM-LOCALLY to reproduce the swapped item's
 * prior contribution of the category-defining macro (the "smaller allowance" —
 * no whole-slot/day re-solve). These tests cover the two pure engine helpers
 * (getIngredientAlternatives + recomputeSwappedIngredient); the tRPC procedure
 * (plan.swapMealItem) is a thin in-place-patch wrapper over them, mirroring
 * plan.swapMealSelection (the supabase chain is impractical to unit-test, per the
 * body-comp precedent — the load-bearing logic lives in these helpers).
 */

import { describe, test, expect } from "vitest";
import {
  getIngredientAlternatives,
  recomputeSwappedIngredient,
  classifyFood,
  macrosFromIngredients,
} from "../solver";
import { resolveFood } from "../../../data/meals/food-map";
import type { MealIngredient } from "../types";

const PROTEIN_A = "petto-pollo"; // chicken (~23g/100g)
const PROTEIN_B = "fiocchi-di-latte"; // cottage cheese (~11.5g/100g, low density)
const CARB = "riso-basmati";
const FAT = "olio-evo";
const FIXED = "acqua"; // zero-sentinel (water) → FIXED

const heldContribution = (foodId: string, grams: number, macro: "proteinG" | "carbsG" | "fatG" | "kcal") =>
  (resolveFood(foodId)[macro] * grams) / 100;

describe("getIngredientAlternatives (#20)", () => {
  test("returns only same-category foods, excluding the ingredient itself", () => {
    const alts = getIngredientAlternatives(PROTEIN_A);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => classifyFood(a.foodId) === "PROTEIN")).toBe(true);
    expect(alts.some((a) => a.foodId === PROTEIN_A)).toBe(false);
  });

  test("a FIXED / zero-sentinel ingredient has no alternatives", () => {
    expect(classifyFood(FIXED)).toBe("FIXED");
    expect(getIngredientAlternatives(FIXED)).toEqual([]);
  });
});

describe("recomputeSwappedIngredient — held-macro parity (#20)", () => {
  test("a PROTEIN→PROTEIN swap reproduces the prior protein contribution (within rounding/bounds)", () => {
    const oldIng: MealIngredient = { foodId: PROTEIN_A, name: "Chicken", grams: 150 };
    const oldP = heldContribution(PROTEIN_A, 150, "proteinG"); // ~34.5g
    const swapped = recomputeSwappedIngredient(oldIng, PROTEIN_B);
    expect(swapped.foodId).toBe(PROTEIN_B);
    expect(swapped.grams).toBeGreaterThan(0);
    const newP = heldContribution(PROTEIN_B, swapped.grams, "proteinG");
    // Held within the per-gram rounding error of the low-density food (≤ a few %).
    expect(Math.abs(newP - oldP)).toBeLessThanOrEqual(Math.max(2, oldP * 0.05));
  });

  test("a CARB→CARB swap holds the carb contribution; a FAT→FAT swap holds fat", () => {
    const carbOld: MealIngredient = { foodId: CARB, name: "Rice", grams: 80 };
    const carbAlts = getIngredientAlternatives(CARB).filter((a) => a.foodId !== CARB);
    const carbSwap = recomputeSwappedIngredient(carbOld, carbAlts[0]!.foodId);
    const cOld = heldContribution(CARB, 80, "carbsG");
    const cNew = heldContribution(carbSwap.foodId, carbSwap.grams, "carbsG");
    expect(Math.abs(cNew - cOld)).toBeLessThanOrEqual(Math.max(3, cOld * 0.05));

    const fatOld: MealIngredient = { foodId: FAT, name: "Oil", grams: 15 };
    const fatAlts = getIngredientAlternatives(FAT).filter((a) => a.foodId !== FAT);
    const fatSwap = recomputeSwappedIngredient(fatOld, fatAlts[0]!.foodId);
    const fOld = heldContribution(FAT, 15, "fatG");
    const fNew = heldContribution(fatSwap.foodId, fatSwap.grams, "fatG");
    // Fat foods hit tight realism caps; hold within rounding or the clamp.
    expect(Math.abs(fNew - fOld)).toBeLessThanOrEqual(Math.max(4, fOld * 0.1));
  });

  test("grams are clamped to the realism band (≥1g, capped at the category max)", () => {
    // chicken 400g → cottage cheese would need ~800g for parity, capped at 400g.
    const oldIng: MealIngredient = { foodId: PROTEIN_A, name: "Chicken", grams: 400 };
    const swapped = recomputeSwappedIngredient(oldIng, PROTEIN_B);
    expect(swapped.grams).toBeGreaterThanOrEqual(1);
    expect(swapped.grams).toBeLessThanOrEqual(400); // PROTEIN ABS cap
  });
});

describe("recomputeSwappedIngredient — validation & purity (#20)", () => {
  test("an unknown foodId throws (controlled, never crashes silently)", () => {
    const oldIng: MealIngredient = { foodId: PROTEIN_A, name: "Chicken", grams: 150 };
    expect(() => recomputeSwappedIngredient(oldIng, "not-a-real-food-xyz")).toThrow();
  });

  test("a cross-category swap is rejected", () => {
    const oldIng: MealIngredient = { foodId: PROTEIN_A, name: "Chicken", grams: 150 };
    expect(() => recomputeSwappedIngredient(oldIng, CARB)).toThrow(/cross-category/);
    expect(() => recomputeSwappedIngredient(oldIng, FAT)).toThrow(/cross-category/);
  });

  test("does not mutate the old ingredient (pure — regression for no-swap byte-identity)", () => {
    const oldIng: MealIngredient = { foodId: PROTEIN_A, name: "Chicken", grams: 150 };
    const before = { ...oldIng };
    recomputeSwappedIngredient(oldIng, PROTEIN_B);
    expect(oldIng).toEqual(before);
  });
});

describe("item-local swap holds the day (#20)", () => {
  test("swapping one PROTEIN item in a meal keeps the meal's protein within ±5%", () => {
    // A small synthetic meal: chicken + rice + oil.
    const meal: MealIngredient[] = [
      { foodId: PROTEIN_A, name: "Chicken", grams: 150 },
      { foodId: CARB, name: "Rice", grams: 80 },
      { foodId: FAT, name: "Oil", grams: 12 },
    ];
    const before = macrosFromIngredients(meal);
    const swapped = recomputeSwappedIngredient(meal[0]!, PROTEIN_B);
    const after = macrosFromIngredients([{ foodId: swapped.foodId, name: swapped.name, grams: swapped.grams }, meal[1]!, meal[2]!]);
    // Protein (the held macro of the swapped item) is preserved at the meal level.
    expect(Math.abs((after.proteinG - before.proteinG) / before.proteinG) * 100).toBeLessThanOrEqual(5);
    // No NaN / zero-gram.
    expect(Number.isNaN(after.kcal)).toBe(false);
    expect(swapped.grams).toBeGreaterThan(0);
  });
});

describe("A3 (#10-math) — extreme-density swap honesty (Roberto's whey→kefir case)", () => {
  test("whey → kefir-density swap reports the held-protein shortfall instead of silently capping", () => {
    // whey-protein: 79 g/100 g protein; latte-scremato maps to plain kefir (4 g/100 g).
    const oldIng: MealIngredient = { foodId: "whey-protein", name: "Whey", grams: 40 };
    const targetP = heldContribution("whey-protein", 40, "proteinG"); // ~31.6 g
    const swapped = recomputeSwappedIngredient(oldIng, "latte-scremato");
    const achieved = heldContribution("latte-scremato", swapped.grams, "proteinG");
    // Parity needs ~790 g of kefir — the realism cap must bind…
    expect(achieved).toBeLessThan(targetP);
    // …and the engine must SAY so (no silent fake equivalence):
    expect(swapped.heldShortfall).toBeDefined();
    expect(swapped.heldShortfall!.held).toBe("proteinG");
    expect(swapped.heldShortfall!.targetContribution).toBeCloseTo(Math.round(targetP * 10) / 10, 1);
    expect(swapped.heldShortfall!.achievedContribution).toBeCloseTo(Math.round(achieved * 10) / 10, 1);
  });

  test("a parity-achievable swap carries NO shortfall report", () => {
    const oldIng: MealIngredient = { foodId: PROTEIN_A, name: "Chicken", grams: 150 };
    const swapped = recomputeSwappedIngredient(oldIng, PROTEIN_B);
    const targetP = heldContribution(PROTEIN_A, 150, "proteinG");
    const achieved = heldContribution(PROTEIN_B, swapped.grams, "proteinG");
    if (Math.abs(achieved - targetP) / targetP <= 0.02) {
      expect(swapped.heldShortfall).toBeUndefined();
    } else {
      expect(swapped.heldShortfall).toBeDefined();
    }
  });
});
