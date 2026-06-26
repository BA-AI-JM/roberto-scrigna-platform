/**
 * DIAGNOSTIC (read-only, NOT wired into generation) — #20 coach item-level swap.
 *
 * Generates a meal plan, picks a PROTEIN ingredient in one slot, lists its
 * same-category alternatives, swaps it for one, and prints:
 *   - old item (food / grams / held-macro contribution)
 *   - new item (food / grams / held-macro contribution)
 * confirming the held macro (protein for a PROTEIN swap) is reproduced within
 * rounding/realism bounds, and the DAY's kcal + protein stay within ±5% of target.
 * Item-local recalc (smaller allowance) — NOT a whole-day re-solve. Asserts nothing.
 *
 * Run: bun run scripts/diag-item-swap.ts
 */

import { createMealPlan } from "../src/engine/meal-plan";
import {
  getIngredientAlternatives,
  recomputeSwappedIngredient,
  classifyFood,
  macrosFromIngredients,
} from "../src/engine/meal-plan";
import { resolveFood } from "../src/data/meals/food-map";
import { ALL_TEMPLATES } from "../src/data/meals";
import type { MacroTargets } from "../src/engine/types";

const macros: MacroTargets = { proteinG: 160, fatG: 60, carbG: 200, totalKcal: 1960, dayType: "training" };
const pct = (a: number, t: number) => (t ? ((a - t) / t) * 100 : 0);
const fp = (a: number, t: number) => (pct(a, t) >= 0 ? "+" : "") + pct(a, t).toFixed(1) + "%";
const contrib = (foodId: string, grams: number, macro: "proteinG" | "carbsG" | "fatG" | "kcal") =>
  Math.round(((resolveFood(foodId)[macro] * grams) / 100) * 10) / 10;

const plan = createMealPlan(ALL_TEMPLATES, {
  dayType: "training",
  macroTargets: macros,
  mealCount: 4,
  substitutionsPerSlot: 3,
});

console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  #20 COACH ITEM SWAP — item-local recalc (hold the item's macro)       ║`);
console.log(`║  training day, 160P / 200C / 60F → 1960 kcal, 4 meals                  ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════╝`);

// Find the first slot with a PROTEIN ingredient.
let target: { slotIdx: number; ingIdx: number } | null = null;
for (let si = 0; si < plan.slots.length; si++) {
  const ings = plan.slots[si]!.primary.scaledIngredients;
  const ii = ings.findIndex((i) => classifyFood(i.foodId) === "PROTEIN");
  if (ii >= 0) { target = { slotIdx: si, ingIdx: ii }; break; }
}
if (!target) { console.log("No PROTEIN ingredient found — abort."); process.exit(0); }

const slot = plan.slots[target.slotIdx]!;
const oldIng = slot.primary.scaledIngredients[target.ingIdx]!;
const alts = getIngredientAlternatives(oldIng.foodId);
const alt = alts.find((a) => a.foodId !== oldIng.foodId)!;

console.log(`\n  Slot: [${slot.slot}] ${slot.primary.template.name}`);
console.log(`  Swapping PROTEIN ingredient #${target.ingIdx}`);
console.log(`  Alternatives available (same category): ${alts.length} — e.g. ${alts.slice(0, 5).map((a) => a.foodId).join(", ")}`);

// Day BEFORE (delivered, summed across primaries).
const dayBefore = plan.slots.reduce(
  (acc, s) => {
    const m = macrosFromIngredients(s.primary.scaledIngredients);
    return { kcal: acc.kcal + m.kcal, proteinG: acc.proteinG + m.proteinG };
  },
  { kcal: 0, proteinG: 0 }
);

const swapped = recomputeSwappedIngredient(oldIng, alt.foodId);

console.log(`\n  ── held macro = PROTEIN (category-defining) ──`);
console.log(`  OLD: ${oldIng.foodId.padEnd(20)} ${String(oldIng.grams).padStart(4)}g → protein ${contrib(oldIng.foodId, oldIng.grams, "proteinG")}g`);
console.log(`  NEW: ${swapped.foodId.padEnd(20)} ${String(swapped.grams).padStart(4)}g → protein ${contrib(swapped.foodId, swapped.grams, "proteinG")}g`);

const oldP = contrib(oldIng.foodId, oldIng.grams, "proteinG");
const newP = contrib(swapped.foodId, swapped.grams, "proteinG");
const parity = Math.abs(newP - oldP);
console.log(`  → held-macro reproduced: Δprotein ${parity.toFixed(1)}g (${oldP > 0 ? ((parity / oldP) * 100).toFixed(1) : "0"}%)`);

// Apply the swap item-locally and recompute the day.
const newSlotIngs = slot.primary.scaledIngredients.map((ing, i) =>
  i === target!.ingIdx ? { foodId: swapped.foodId, name: swapped.name, grams: swapped.grams } : ing
);
const dayAfter = plan.slots.reduce(
  (acc, s, si) => {
    const ings = si === target!.slotIdx ? newSlotIngs : s.primary.scaledIngredients;
    const m = macrosFromIngredients(ings);
    return { kcal: acc.kcal + m.kcal, proteinG: acc.proteinG + m.proteinG };
  },
  { kcal: 0, proteinG: 0 }
);

console.log(`\n  ── day totals (delivered) ──`);
console.log(`  BEFORE: kcal ${Math.round(dayBefore.kcal)}  P ${Math.round(dayBefore.proteinG)}`);
console.log(`  AFTER : kcal ${Math.round(dayAfter.kcal)}(${fp(dayAfter.kcal, macros.totalKcal)})  P ${Math.round(dayAfter.proteinG)}(${fp(dayAfter.proteinG, macros.proteinG)})`);
console.log(`  → day kcal±5%: ${Math.abs(pct(dayAfter.kcal, macros.totalKcal)) <= 5 ? "✓" : "✗"} · protein±5%: ${Math.abs(pct(dayAfter.proteinG, macros.proteinG)) <= 5 ? "✓" : "✗"}`);
console.log(`  → swap is item-local: only slot [${slot.slot}] ingredient #${target.ingIdx} changed; other meals untouched.\n`);
