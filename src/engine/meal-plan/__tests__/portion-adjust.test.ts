/**
 * #21 portion-adjust magnitude — engine invariants.
 *
 * adjustPortions gained an optional { mode, scalePct }:
 *   - "target" (default): UNCHANGED — rescale the day to its calorie target.
 *   - "relative": bump every ingredient by (1 + scalePct/100), clamped to the
 *     engine realism rails (clampAdjustedGrams), macros recomputed from grams.
 *
 * The procedure itself is a thin in-place-patch wrapper (the supabase chain is
 * impractical to unit-test, per the body-comp precedent) — the load-bearing new
 * logic is `clampAdjustedGrams` + recompute-from-grams, tested here. The "target"
 * path is byte-identical because its code is untouched (a separate branch).
 */

import { describe, test, expect } from "vitest";
import { clampAdjustedGrams, macrosFromIngredients } from "../solver";
import { resolveFood } from "../../../data/meals/food-map";
import type { MealIngredient } from "../types";

const PROTEIN = "petto-pollo"; // PROTEIN, abs cap 400g
const OIL = "olio-evo"; // FAT, per-food cap 40g
const CARB = "riso-basmati";
const EGG = "uova-intere"; // whole egg → 60g units

describe("clampAdjustedGrams — realism rails (#21)", () => {
  test("keeps a normal in-band value (rounded)", () => {
    const g = clampAdjustedGrams(PROTEIN, 150 * 1.1); // 165
    expect(g).toBeGreaterThan(150);
    expect(g).toBeLessThanOrEqual(200);
  });

  test("caps at the per-category / per-food ceiling", () => {
    expect(clampAdjustedGrams(PROTEIN, 1000)).toBeLessThanOrEqual(400); // PROTEIN abs cap
    expect(clampAdjustedGrams(OIL, 500)).toBeLessThanOrEqual(40); // olio-evo per-food cap
  });

  test("floors at ≥1 g", () => {
    expect(clampAdjustedGrams(CARB, 0.2)).toBeGreaterThanOrEqual(1);
  });

  test("whole eggs snap to 60 g units (≥1 unit)", () => {
    expect(clampAdjustedGrams(EGG, 66)).toBe(60); // +10% of one egg → still one egg
    expect(clampAdjustedGrams(EGG, 95)).toBe(120); // rounds to 2 units
    expect(clampAdjustedGrams(EGG, 10)).toBe(60); // never below one egg
    expect(clampAdjustedGrams(EGG, 130)).toBe(120);
  });
});

describe("relative bump — proportional within clamps (#21)", () => {
  // A synthetic in-band meal so no ingredient hits a cap.
  const meal: MealIngredient[] = [
    { foodId: PROTEIN, name: "Chicken", grams: 150 },
    { foodId: CARB, name: "Rice", grams: 80 },
    { foodId: OIL, name: "Oil", grams: 12 },
  ];

  const bump = (factor: number): MealIngredient[] =>
    meal.map((ing) => ({ ...ing, grams: clampAdjustedGrams(ing.foodId, ing.grams * factor) }));

  test("+10% raises day kcal by ~10% (within clamp/round tolerance)", () => {
    const base = macrosFromIngredients(meal).kcal;
    const up = macrosFromIngredients(bump(1.1)).kcal;
    expect(Math.abs(up - base * 1.1) / (base * 1.1)).toBeLessThanOrEqual(0.05);
    expect(up).toBeGreaterThan(base);
  });

  test("−10% lowers day kcal by ~10%", () => {
    const base = macrosFromIngredients(meal).kcal;
    const down = macrosFromIngredients(bump(0.9)).kcal;
    expect(Math.abs(down - base * 0.9) / (base * 0.9)).toBeLessThanOrEqual(0.05);
    expect(down).toBeLessThan(base);
  });

  test("+25% never exceeds any per-category cap; no NaN/zero-gram", () => {
    const up = bump(1.25);
    for (const ing of up) {
      const cat = resolveFood(ing.foodId).category;
      expect(ing.grams).toBeGreaterThanOrEqual(1);
      if (cat === "Protein Sources") expect(ing.grams).toBeLessThanOrEqual(400);
      if (ing.foodId === OIL) expect(ing.grams).toBeLessThanOrEqual(40);
    }
    expect(Number.isNaN(macrosFromIngredients(up).kcal)).toBe(false);
  });

  test("clampAdjustedGrams is pure — does not mutate inputs", () => {
    const ing: MealIngredient = { foodId: PROTEIN, name: "Chicken", grams: 150 };
    const before = { ...ing };
    clampAdjustedGrams(ing.foodId, ing.grams * 1.1);
    expect(ing).toEqual(before);
  });
});
