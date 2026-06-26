/**
 * DIAGNOSTIC (read-only, NOT wired into generation) — #16b source pins.
 *
 * Asserts nothing. Prints, per meal, the protein-category food actually used
 * (must be the pinned food) plus delivered kcal/protein vs target. Two pinned
 * scenarios on the SAME aggressive rest-day target (160P/80C/60F → 1500 kcal,
 * 4 meals), plus the OFF baseline, so the result is honest in both directions:
 *
 *   A. FEASIBLE pin — PROTEIN = petto-pollo (chicken, high density ~31g/100g).
 *      The pin holds AND both protected macros (kcal + protein) stay within ±5%.
 *      This is the headline guarantee: a pin changes WHICH food fills a category,
 *      not the targets — when the pinned food can physically carry them.
 *
 *   B. REALISM-LIMIT pin — PROTEIN = fiocchi-di-latte (cottage cheese, low
 *      density ~11.5g/100g). The pin still holds (every protein source IS the
 *      cottage cheese) and kcal stays protected, but protein legitimately YIELDS:
 *      160g protein from cottage cheese alone would need ~1.4kg of it, which both
 *      the kcal ceiling AND the solver realism guard (PROTEIN ≤400g, ×2.5 of base)
 *      forbid. This is EXPECTED — the same way a low-carb day falls short on carbs.
 *      Not a bug: the pin can't overrule physics or the realism bounds.
 *
 * Run: bun run scripts/diag-source-pins.ts
 */

import { createMealPlan } from "../src/engine/meal-plan";
import { classifyFood } from "../src/engine/meal-plan/solver";
import { resolveFood } from "../src/data/meals/food-map";
import { ALL_TEMPLATES } from "../src/data/meals";
import type { MacroTargets } from "../src/engine/types";
import type { SourcePin } from "../src/engine/meal-plan/types";

const FEASIBLE = "petto-pollo"; // chicken breast (high protein density)
const LIMIT = "fiocchi-di-latte"; // cottage cheese (low protein density)
const macros: MacroTargets = { proteinG: 160, fatG: 60, carbG: 80, totalKcal: 1500, dayType: "rest" };
const pct = (a: number, t: number) => (t ? ((a - t) / t) * 100 : 0);
const fp = (a: number, t: number) => (pct(a, t) >= 0 ? "+" : "") + pct(a, t).toFixed(1) + "%";

function run(pinFoodId: string | null) {
  const sourcePins: Partial<Record<"rest", SourcePin>> | undefined = pinFoodId
    ? { rest: { PROTEIN: { foodId: pinFoodId } } }
    : undefined;
  return createMealPlan(ALL_TEMPLATES, {
    dayType: "rest",
    macroTargets: macros,
    mealCount: 4,
    substitutionsPerSlot: 3,
    ...(sourcePins ? { sourcePins } : {}),
  });
}

console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  #16b SOURCE PIN diagnostic                                            ║`);
console.log(`║  rest day, ${macros.proteinG}P / ${macros.carbG}C / ${macros.fatG}F → ${macros.totalKcal} kcal, 4 meals                       ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════╝`);

type Scenario = { label: string; pin: string | null; expectPinned: boolean; note: string };
const scenarios: Scenario[] = [
  { label: "OFF — free selection (baseline)", pin: null, expectPinned: false, note: "" },
  {
    label: `A · FEASIBLE pin — PROTEIN = ${FEASIBLE} (${resolveFood(FEASIBLE).proteinG}g/100g)`,
    pin: FEASIBLE,
    expectPinned: true,
    note: "high-density → both protected macros (kcal + protein) hold within ±5%",
  },
  {
    label: `B · REALISM-LIMIT pin — PROTEIN = ${LIMIT} (${resolveFood(LIMIT).proteinG}g/100g)`,
    pin: LIMIT,
    expectPinned: true,
    note: "low-density → pin holds, kcal protected, protein YIELDS (expected, not a bug)",
  },
];

for (const s of scenarios) {
  const plan = run(s.pin);
  const g = plan.actualMacros;
  console.log(`\n──────── ${s.label} ────────`);
  for (const slot of plan.slots) {
    const proteinFoods = slot.primary.scaledIngredients
      .filter((i) => classifyFood(i.foodId) === "PROTEIN")
      .map((i) => `${i.foodId} ${i.grams}g`);
    console.log(`  [${slot.slot}] ${slot.primary.template.name}`);
    console.log(`      protein source(s): ${proteinFoods.join(", ") || "(none)"}`);
  }
  console.log(
    `  → delivered: kcal ${g.kcal}(${fp(g.kcal, macros.totalKcal)})  P ${g.proteinG}(${fp(g.proteinG, macros.proteinG)})  C ${g.carbsG}(${fp(g.carbsG, macros.carbG)})`
  );
  if (s.expectPinned && s.pin) {
    const pinnedEverywhere = plan.slots.every((slot) => {
      const prot = slot.primary.scaledIngredients.filter((i) => classifyFood(i.foodId) === "PROTEIN");
      return prot.length === 0 || prot.every((i) => i.foodId === s.pin);
    });
    const kcalOk = Math.abs(pct(g.kcal, macros.totalKcal)) <= 5;
    const protOk = Math.abs(pct(g.proteinG, macros.proteinG)) <= 5;
    console.log(`  → every protein source is the pinned food: ${pinnedEverywhere ? "YES ✓" : "NO ✗"}`);
    console.log(`  → kcal±5% ${kcalOk ? "✓" : "✗"} · protein±5% ${protOk ? "✓ (held)" : "✗ (yielded — see note)"}`);
    console.log(`  → note: ${s.note}`);
  }
}
console.log("");
