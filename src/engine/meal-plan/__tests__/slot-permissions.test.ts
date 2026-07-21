/**
 * B1 (#10) — meal-slot food-class coherence, per Model 1 §1
 * (docs/reference/MODEL-1-ENG.md). Roberto's report: seafood offered at
 * breakfast. Swap alternatives must be same-category AND slot-class-coherent.
 */
import { describe, test, expect } from "vitest";
import { isFoodAllowedInSlot } from "../slot-permissions";
import { getIngredientAlternatives } from "../solver";

describe("isFoodAllowedInSlot", () => {
  test("seafood and raw meat are NOT breakfast foods (Roberto's exact complaint)", () => {
    for (const id of ["salmone", "polpo", "gamberi", "orata", "petto-pollo", "manzo-filetto"]) {
      expect(isFoodAllowedInSlot(id, "PROTEIN", "breakfast")).toBe(false);
    }
  });

  test("the Model-1 colazione protein class IS allowed at breakfast", () => {
    for (const id of ["yogurt-greco", "latte-scremato", "albume", "uova-intere", "whey-protein", "fiocchi-di-latte"]) {
      expect(isFoodAllowedInSlot(id, "PROTEIN", "breakfast")).toBe(true);
    }
  });

  test("lunch and dinner are unrestricted (full class tables)", () => {
    expect(isFoodAllowedInSlot("salmone", "PROTEIN", "lunch")).toBe(true);
    expect(isFoodAllowedInSlot("polpo", "PROTEIN", "dinner")).toBe(true);
    expect(isFoodAllowedInSlot("riso-basmati", "CARB", "lunch")).toBe(true);
  });

  test("morning carbs/fats follow Model 1 (no rice/pasta or cooking oil at colazione)", () => {
    expect(isFoodAllowedInSlot("riso-basmati", "CARB", "breakfast")).toBe(false);
    expect(isFoodAllowedInSlot("fiocchi-avena", "CARB", "breakfast")).toBe(true);
    expect(isFoodAllowedInSlot("olio-evo", "FAT", "breakfast")).toBe(false);
    expect(isFoodAllowedInSlot("mandorle", "FAT", "breakfast")).toBe(true);
  });

  test("whole eggs: breakfast yes, spuntino no (Model 1 lists egg whites only there)", () => {
    expect(isFoodAllowedInSlot("uova-intere", "PROTEIN", "breakfast")).toBe(true);
    expect(isFoodAllowedInSlot("uova-intere", "PROTEIN", "snack")).toBe(false);
  });

  test("unknown/absent slot → unrestricted (back-compat)", () => {
    expect(isFoodAllowedInSlot("salmone", "PROTEIN", undefined)).toBe(true);
    expect(isFoodAllowedInSlot("salmone", "PROTEIN", "post_workout")).toBe(true);
  });
});

describe("getIngredientAlternatives with slot", () => {
  test("breakfast yogurt offers only the colazione class — no seafood, no raw meat", () => {
    const alts = getIngredientAlternatives("yogurt-greco", "breakfast").map((a) => a.foodId);
    expect(alts.length).toBeGreaterThan(0);
    for (const banned of ["salmone", "polpo", "gamberi", "petto-pollo", "tonno-scatola"]) {
      expect(alts).not.toContain(banned);
    }
    expect(alts).toContain("whey-protein");
    expect(alts).toContain("latte-scremato");
  });

  test("the same yogurt at lunch offers the full protein class", () => {
    const alts = getIngredientAlternatives("yogurt-greco", "lunch").map((a) => a.foodId);
    expect(alts).toContain("salmone");
    expect(alts).toContain("petto-pollo");
  });

  test("no slot argument → unchanged category-wide behaviour", () => {
    const alts = getIngredientAlternatives("yogurt-greco").map((a) => a.foodId);
    expect(alts).toContain("salmone");
  });
});
