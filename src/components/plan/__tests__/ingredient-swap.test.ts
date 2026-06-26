/**
 * #20 — coach item-level food swap: client-side alternatives + the swap payload
 * + the swappable ingredient list render.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  getIngredientAlternatives,
  buildSwapArgs,
  IngredientSwapList,
} from "../ingredient-swap";
import type { FoodCatalogue } from "../source-swap-card";

const CATALOGUE: FoodCatalogue = {
  PROTEIN: [
    { foodId: "petto-pollo", name: "Chicken breast (raw)" },
    { foodId: "fiocchi-di-latte", name: "Cottage cheese low-fat" },
    { foodId: "yogurt-greco", name: "Greek yogurt" },
  ],
  CARB: [{ foodId: "riso-basmati", name: "Basmati rice (dry)" }],
  FAT: [{ foodId: "olio-evo", name: "Olive oil" }],
  VEG: [{ foodId: "broccoli", name: "Broccoli (raw)" }],
  FRUIT: [{ foodId: "banana", name: "Banana (peeled)" }],
};

describe("getIngredientAlternatives", () => {
  test("returns same-category foods minus the ingredient itself", () => {
    const alts = getIngredientAlternatives("petto-pollo", CATALOGUE);
    expect(alts.map((a) => a.foodId).sort()).toEqual(["fiocchi-di-latte", "yogurt-greco"]);
  });

  test("a foodId not in the catalogue (FIXED / water / spices) → no alternatives", () => {
    expect(getIngredientAlternatives("acqua", CATALOGUE)).toEqual([]);
  });

  test("undefined foodId or missing catalogue → []", () => {
    expect(getIngredientAlternatives(undefined, CATALOGUE)).toEqual([]);
    expect(getIngredientAlternatives("petto-pollo", undefined)).toEqual([]);
  });

  test("a category with only the ingredient itself → no alternatives", () => {
    expect(getIngredientAlternatives("riso-basmati", CATALOGUE)).toEqual([]);
  });
});

describe("buildSwapArgs", () => {
  test("produces the exact swapMealItem payload", () => {
    expect(buildSwapArgs("plan-1", "training", "lunch", 2, "yogurt-greco")).toEqual({
      planId: "plan-1",
      dayType: "training",
      slot: "lunch",
      ingredientIndex: 2,
      newFoodId: "yogurt-greco",
    });
  });
});

describe("IngredientSwapList render", () => {
  const ingredients = [
    { foodId: "petto-pollo", name: "Petto di pollo", grams: 150 },
    { foodId: "acqua", name: "Acqua", grams: 200 }, // FIXED → not swappable
    { foodId: "riso-basmati", name: "Riso basmati", grams: 80 }, // alone in CARB → not swappable
  ];

  test("offers a 'Sostituisci' control only on rows with alternatives", () => {
    const html = renderToStaticMarkup(
      createElement(IngredientSwapList, {
        ingredients,
        catalogue: CATALOGUE,
        pendingIndex: null,
        onSwap: () => {},
      })
    );
    // Only the protein row (petto-pollo, has 2 alternatives) is swappable —
    // exactly one swap control (its aria-label appears once per swappable row).
    expect(html.match(/Sostituisci alimento/g) ?? []).toHaveLength(1);
    // All ingredient names still render.
    expect(html).toContain("Petto di pollo");
    expect(html).toContain("Acqua");
    expect(html).toContain("Riso basmati");
  });

  test("shows the pending label on the row whose swap is in flight", () => {
    const html = renderToStaticMarkup(
      createElement(IngredientSwapList, {
        ingredients,
        catalogue: CATALOGUE,
        pendingIndex: 0,
        onSwap: () => {},
      })
    );
    expect(html).toContain("Sostituendo…");
  });

  test("renders nothing for an empty ingredient list", () => {
    const html = renderToStaticMarkup(
      createElement(IngredientSwapList, {
        ingredients: [],
        catalogue: CATALOGUE,
        pendingIndex: null,
        onSwap: () => {},
      })
    );
    expect(html).toBe("");
  });
});
