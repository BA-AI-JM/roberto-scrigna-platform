/**
 * DIAGNOSTIC (read-only, NOT wired into generation) — #11 combat-sport protocols.
 *
 * Generates a "fight-week" sample for a combat athlete with BOTH restriction
 * protocols on (fibre_restriction + sodium_restriction) plus the water_loading
 * schedule, and prints, per day-type:
 *   - delivered kcal / protein with %delta (must stay within ±5%)
 *   - total day fibre  (< 10 g ✓/✗)
 *   - total day sodium (< 500 mg ✓/✗)
 * then the 4-day water-loading fluid schedule (mL).
 *
 * Also prints the modes-OFF baseline so the restriction effect is visible and the
 * OFF==unchanged contract is observable. Asserts nothing.
 * Run: bun run scripts/diag-combat-protocols.ts
 */

import { createMealPlan } from "../src/engine/meal-plan";
import {
  FIBRE_RESTRICTION_CAP_G,
  SODIUM_RESTRICTION_CAP_MG,
  type MealPlanConfig,
} from "../src/engine/meal-plan";
import { waterLoadingSchedule } from "../src/engine/hydration";
import { ALL_TEMPLATES } from "../src/data/meals";
import type { MacroTargets } from "../src/engine/types";

const FIGHTER_KG = 70;

function rx(p: number, f: number, c: number, dayType: MacroTargets["dayType"]): MacroTargets {
  return { proteinG: p, fatG: f, carbG: c, totalKcal: p * 4 + c * 4 + f * 9, dayType };
}
const pct = (a: number, t: number) => (t ? ((a - t) / t) * 100 : 0);
const fp = (a: number, t: number) => (pct(a, t) >= 0 ? "+" : "") + pct(a, t).toFixed(1) + "%";
const flag = (ok: boolean) => (ok ? "✓" : "✗");

// A fighter's fight-week cutting days.
const DAYS: { label: string; macros: MacroTargets; meals: number }[] = [
  { label: "training", macros: rx(165, 55, 110, "training"), meals: 4 },
  { label: "rest", macros: rx(160, 60, 80, "rest"), meals: 4 },
];

function run(label: string, macros: MacroTargets, meals: number, protocols: boolean) {
  const config: MealPlanConfig = {
    dayType: macros.dayType,
    macroTargets: macros,
    mealCount: meals,
    substitutionsPerSlot: 3,
    ...(protocols
      ? { fibreMode: "cap" as const, fibreCapG: FIBRE_RESTRICTION_CAP_G, sodiumCapMg: SODIUM_RESTRICTION_CAP_MG }
      : {}),
  };
  const plan = createMealPlan(ALL_TEMPLATES, config);
  const g = plan.actualMacros;
  // safety scan
  let bad = 0;
  for (const slot of plan.slots) {
    for (const ing of slot.primary.scaledIngredients) {
      if (!Number.isFinite(ing.grams) || ing.grams <= 0) bad++;
    }
  }
  return { g, bad, withinTolerance: plan.withinTolerance };
}

console.log(`\n╔════════════════════════════════════════════════════════════════════════╗`);
console.log(`║  #11 FIGHT-WEEK SAMPLE — ${FIGHTER_KG}kg combat athlete                            ║`);
console.log(`║  fibre_restriction (<${FIBRE_RESTRICTION_CAP_G + 1}g) + sodium_restriction (<${SODIUM_RESTRICTION_CAP_MG}mg) + water_loading      ║`);
console.log(`╚════════════════════════════════════════════════════════════════════════╝`);

for (const { label, macros, meals } of DAYS) {
  console.log(`\n──────── ${label.toUpperCase()} day (${meals} meals) — target ${macros.totalKcal} kcal / ${macros.proteinG}P / ${macros.carbG}C / ${macros.fatG}F ────────`);

  const off = run(label, macros, meals, false);
  const on = run(label, macros, meals, true);

  const row = (name: string, r: ReturnType<typeof run>) => {
    const fibreOk = (r.g.fibreG ?? 0) < 10;
    const sodiumOk = (r.g.sodiumMg ?? 0) < 500;
    const kcalOk = Math.abs(pct(r.g.kcal, macros.totalKcal)) <= 5;
    const protOk = Math.abs(pct(r.g.proteinG, macros.proteinG)) <= 5;
    console.log(
      `  ${name.padEnd(16)} kcal ${r.g.kcal}(${fp(r.g.kcal, macros.totalKcal)}) ${flag(kcalOk)}  ` +
        `P ${r.g.proteinG}(${fp(r.g.proteinG, macros.proteinG)}) ${flag(protOk)}  ` +
        `fibre ${(r.g.fibreG ?? 0).toFixed(1)}g ${name.includes("ON") ? `(<10 ${flag(fibreOk)})` : ""}  ` +
        `sodium ${Math.round(r.g.sodiumMg ?? 0)}mg ${name.includes("ON") ? `(<500 ${flag(sodiumOk)})` : ""}  ` +
        `bad ${r.bad}`
    );
  };
  row("OFF (baseline)", off);
  row("ON (fight-week)", on);
  console.log(
    `  → restriction effect: fibre ${(off.g.fibreG ?? 0).toFixed(1)}g → ${(on.g.fibreG ?? 0).toFixed(1)}g  ·  ` +
      `sodium ${Math.round(off.g.sodiumMg ?? 0)}mg → ${Math.round(on.g.sodiumMg ?? 0)}mg`
  );
}

// ── Water loading schedule ────────────────────────────────────────────────────
console.log(`\n──────── WATER LOADING — ${FIGHTER_KG}kg fighter ────────`);
const sched = waterLoadingSchedule(FIGHTER_KG);
console.log(`  load: ${sched.mlPerKgLoad} mL/kg/day`);
for (const d of sched.days) {
  console.log(`  Day ${d.day}  ${(d.fluidMl + " mL").padEnd(10)} [${d.phase}]`);
}
console.log("");
