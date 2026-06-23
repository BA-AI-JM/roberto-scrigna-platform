/**
 * DIAGNOSTIC (read-only, NOT wired into generation) — #food-enrichment Stage 2.
 *
 * Generates plans for ONE representative athlete at TWO day-types — a LOW-CARB
 * day and a HIGH-CARB day — using the per-ingredient solver, and prints:
 *   - prescription vs delivered kcal/protein/carbs/fat/fibre/sodium (+%delta)
 *   - each meal's full ingredient list with grams
 *   - FLAGS for every filler addition (ingredient not in the source template)
 *     and any out-of-bound / zero-gram ingredient (should be none)
 *
 * Asserts nothing. Run: bun run scripts/diag-stage2-plans.ts
 */

import { createMealPlan } from "../src/engine/meal-plan/planner";
import { ALL_TEMPLATES } from "../src/data/meals/templates";
import type { MacroTargets } from "../src/engine/types";

// One representative athlete (~80 kg male), two day-types.
const DAYS: { label: string; macros: MacroTargets; mealCount: number }[] = [
  { label: "LOW-CARB day", macros: rx(170, 90, 90, "rest"), mealCount: 4 },
  { label: "HIGH-CARB day", macros: rx(165, 60, 320, "training"), mealCount: 5 },
];

function rx(proteinG: number, fatG: number, carbG: number, dayType: MacroTargets["dayType"]): MacroTargets {
  return { proteinG, fatG, carbG, totalKcal: proteinG * 4 + carbG * 4 + fatG * 9, dayType };
}

function pct(a: number, t: number): string {
  const d = t ? ((a - t) / t) * 100 : 0;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

for (const { label, macros, mealCount } of DAYS) {
  const plan = createMealPlan(ALL_TEMPLATES, { dayType: macros.dayType, macroTargets: macros, mealCount, substitutionsPerSlot: 3 });
  const g = plan.actualMacros;
  console.log(`\n══════════ ${label} (${mealCount} meals, ${macros.dayType}) ══════════`);
  console.log(`prescription : kcal ${macros.totalKcal}  P ${macros.proteinG}  C ${macros.carbG}  F ${macros.fatG}`);
  console.log(
    `delivered    : kcal ${g.kcal}(${pct(g.kcal, macros.totalKcal)})  P ${g.proteinG}(${pct(g.proteinG, macros.proteinG)})  C ${g.carbsG}(${pct(g.carbsG, macros.carbG)})  F ${g.fatG}(${pct(g.fatG, macros.fatG)})  fibre ${g.fibreG ?? 0}g  sodium ${g.sodiumMg ?? 0}mg`
  );
  const fibreFloor = (10 * g.kcal) / 1000;
  console.log(`fibre floor  : need ≥ ${fibreFloor.toFixed(1)}g/day → ${(g.fibreG ?? 0) >= fibreFloor ? "MET" : "BELOW"};  withinTolerance=${plan.withinTolerance}`);

  let fillerCount = 0;
  let badGrams = 0;
  for (const slot of plan.slots) {
    const templateIds = new Set(slot.primary.template.ingredients.map((i) => i.foodId));
    const lines = slot.primary.scaledIngredients.map((ing) => {
      const isFiller = !templateIds.has(ing.foodId);
      if (isFiller) fillerCount++;
      if (!Number.isFinite(ing.grams) || ing.grams <= 0) badGrams++;
      return `      ${ing.name} ${ing.grams}g${isFiller ? "   ⟵ FILLER" : ""}`;
    });
    console.log(`  [${slot.slot}] ${slot.primary.template.name}`);
    console.log(lines.join("\n"));
  }
  console.log(`  fillers added: ${fillerCount};  out-of-bound/zero-gram ingredients: ${badGrams}`);
}
