/**
 * DIAGNOSTIC (read-only, NOT wired into generation) — #21 portion-adjust magnitude.
 *
 * Replicates the adjustPortions transforms on a generated day (no DB):
 *   - "target": rescale every ingredient by scale = targetKcal/actualKcal
 *     (the existing behaviour — should land the day on its calorie target).
 *   - "relative" +10% / −10%: bump every ingredient by (1 + scalePct/100),
 *     clamped to the engine realism rails (clampAdjustedGrams), macros recomputed
 *     from the clamped grams.
 * Prints day kcal/macros before/after each, confirming relative scales
 * proportionally and clamps hold. Asserts nothing.
 *
 * Run: bun run scripts/diag-portion-adjust.ts
 */

import { createMealPlan, macrosFromIngredients, clampAdjustedGrams } from "../src/engine/meal-plan";
import { roundGrams } from "../src/engine/meal-plan/rounding";
import { ALL_TEMPLATES } from "../src/data/meals";
import type { MacroTargets } from "../src/engine/types";
import type { MealIngredient } from "../src/engine/meal-plan/types";

const macros: MacroTargets = { proteinG: 160, fatG: 60, carbG: 200, totalKcal: 1960, dayType: "training" };
const pct = (a: number, t: number) => (t ? ((a - t) / t) * 100 : 0);
const fp = (a: number, t: number) => (pct(a, t) >= 0 ? "+" : "") + pct(a, t).toFixed(1) + "%";

const plan = createMealPlan(ALL_TEMPLATES, {
  dayType: "training",
  macroTargets: macros,
  mealCount: 4,
  substitutionsPerSlot: 2,
});

// Day delivered macros from the primaries' actual grams.
const dayFromSlots = (slotsIngs: MealIngredient[][]) => {
  const acc = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  for (const ings of slotsIngs) {
    const m = macrosFromIngredients(ings);
    acc.kcal += m.kcal; acc.proteinG += m.proteinG; acc.fatG += m.fatG; acc.carbsG += m.carbsG;
  }
  return {
    kcal: Math.round(acc.kcal),
    proteinG: Math.round(acc.proteinG * 10) / 10,
    fatG: Math.round(acc.fatG * 10) / 10,
    carbsG: Math.round(acc.carbsG * 10) / 10,
  };
};

const baseIngs = plan.slots.map((s) => s.primary.scaledIngredients);
const base = dayFromSlots(baseIngs);
const actualKcal = base.kcal;

console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  #21 PORTION ADJUST — magnitude/direction                              ║`);
console.log(`║  training day, target 1960 kcal, 4 meals                              ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════╝`);
console.log(`\n  BASE (generated):  kcal ${base.kcal}  P ${base.proteinG}  F ${base.fatG}  C ${base.carbsG}`);

// ── "target" mode: scale = targetKcal/actualKcal (existing behaviour) ──
const scale = macros.totalKcal / actualKcal;
const targetIngs = baseIngs.map((ings) =>
  ings.map((ing) => ({ ...ing, grams: Math.max(1, roundGrams(ing.grams * scale)) }))
);
const tgt = dayFromSlots(targetIngs);
console.log(`\n  ── "target" (scale ${scale.toFixed(3)} = target/actual) ──`);
console.log(`  AFTER:  kcal ${tgt.kcal}(${fp(tgt.kcal, macros.totalKcal)})  P ${tgt.proteinG}  F ${tgt.fatG}  C ${tgt.carbsG}`);
console.log(`  → lands on the calorie target (${fp(tgt.kcal, macros.totalKcal)} vs target)`);

// ── "relative" mode: bump every ingredient, clamp to realism rails ──
for (const scalePct of [10, -10, 25] as const) {
  const factor = 1 + scalePct / 100;
  let clampHits = 0;
  const relIngs = baseIngs.map((ings) =>
    ings.map((ing) => {
      const wanted = ing.grams * factor;
      const got = ing.foodId ? clampAdjustedGrams(ing.foodId, wanted) : Math.max(1, roundGrams(wanted));
      if (Math.abs(got - wanted) > 1.5) clampHits++;
      return { ...ing, grams: got };
    })
  );
  const rel = dayFromSlots(relIngs);
  const expected = Math.round(actualKcal * factor);
  console.log(`\n  ── "relative" ${scalePct > 0 ? "+" : ""}${scalePct}% (factor ${factor}) ──`);
  console.log(`  AFTER:  kcal ${rel.kcal}  P ${rel.proteinG}  F ${rel.fatG}  C ${rel.carbsG}`);
  console.log(`  → expected ≈ base×${factor} = ${expected} kcal; got ${rel.kcal} (${fp(rel.kcal, expected)} vs expected)`);
  console.log(`  → ingredients adjusted off the naive bump (clamp / egg-snap / 5g-round): ${clampHits}`);
}
console.log("");
