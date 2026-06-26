/**
 * DIAGNOSTIC (read-only, NOT wired into generation) — #17 periodization tiers.
 *
 * Generates a MODE-4 week (rest=OFF + training_light + training_medium +
 * training_intense + training_double) and prints, per distinct day-type:
 *   - computed TDEE + the exercise (Attività) component,
 *   - the macro TARGET (kcal / P / F / C),
 *   - the DELIVERED meal-plan macros (kcal / P / F / C),
 * confirming the per-tier kcal is DISTINCT and RISES with intensity
 * (light < medium < intense < double), with OFF (rest) lowest. Asserts nothing.
 *
 * Intensity flows through TDEE (per-tier session expenditure) + the carb
 * remainder — NOT through protein/fat ratio shifts (the tiers clone the training
 * multipliers; values are a Roberto-calibration point).
 *
 * Run: bun run scripts/diag-periodization-tiers.ts
 */

import { generatePlan } from "../src/services/plan-generator";
import type { ClientSnapshot, DayType } from "../src/engine/types";

const client: ClientSnapshot = {
  sex: "male",
  ageYears: 32,
  weightKg: 82,
  heightCm: 180,
  dailySteps: 9000,
  occupationalLevel: "sedentary",
  // mode-4 vocabulary: OFF + the four training-intensity tiers (5 distinct types)
  weekSchedule: [
    "rest",
    "training_light",
    "training_medium",
    "training_intense",
    "training_double",
    "rest",
    "rest",
  ],
};

const ORDER: DayType[] = ["rest", "training_light", "training_medium", "training_intense", "training_double"];
const LABEL: Record<string, string> = {
  rest: "OFF (rest)",
  training_light: "leggero",
  training_medium: "medio",
  training_intense: "intenso",
  training_double: "doppia",
};

// clientInfo is required by PlanGenerationInput (PDF cover) but unused by meal gen.
const result = generatePlan({
  clientInfo: { fullName: "Diag Tier", planDate: "2026-06-26" },
  snapshot: client,
  mealCount: 4,
});
const pad = (s: string | number, n: number) => String(s).padStart(n);

console.log(`\n╔════════════════════════════════════════════════════════════════════════════╗`);
console.log(`║  #17 PERIODIZATION TIERS — mode-4 week (OFF + light/medium/intense/double)  ║`);
console.log(`║  male 82kg/180cm/32y, 9000 steps, sedentary, 4 meals                        ║`);
console.log(`╚════════════════════════════════════════════════════════════════════════════╝`);
console.log(
  `\n  ${pad("tier", 12)} │ ${pad("TDEE", 6)} ${pad("Attiv", 6)} │ ${pad("tgtKcal", 8)} ${pad("P", 5)} ${pad("F", 5)} ${pad("C", 5)} │ ${pad("delivKcal", 9)} ${pad("P", 5)} ${pad("F", 5)} ${pad("C", 5)}`
);
console.log(`  ${"─".repeat(12)}─┼─${"─".repeat(13)}─┼─${"─".repeat(25)}─┼─${"─".repeat(27)}`);

const kcalByTier: { tier: DayType; tdee: number; deliv: number }[] = [];

for (const tier of ORDER) {
  const day = result.weeklyPlan.days.find((d) => d.dayType === tier);
  const mp = result.mealPlans.get(tier);
  if (!day || !mp) {
    console.log(`  ${pad(LABEL[tier]!, 12)} │ (missing)`);
    continue;
  }
  const tdee = Math.round(day.tdee.totalTdeeKcal);
  const attiv = Math.round(day.tdee.exercise.exerciseKcal);
  const t = day.macros;
  const a = mp.actualMacros;
  console.log(
    `  ${pad(LABEL[tier]!, 12)} │ ${pad(tdee, 6)} ${pad(attiv, 6)} │ ${pad(t.totalKcal, 8)} ${pad(t.proteinG, 5)} ${pad(t.fatG, 5)} ${pad(t.carbG, 5)} │ ${pad(a.kcal, 9)} ${pad(a.proteinG, 5)} ${pad(a.fatG, 5)} ${pad(a.carbsG, 5)}`
  );
  kcalByTier.push({ tier, tdee, deliv: a.kcal });
}

// Monotonicity check across the training tiers (light < medium < intense < double).
const tiers = kcalByTier.filter((k) => k.tier !== "rest");
const risingTdee = tiers.every((k, i) => i === 0 || k.tdee > tiers[i - 1]!.tdee);
const risingDeliv = tiers.every((k, i) => i === 0 || k.deliv > tiers[i - 1]!.deliv);
const distinct = new Set(tiers.map((k) => k.deliv)).size === tiers.length;
const offLowest = kcalByTier.find((k) => k.tier === "rest")!.deliv < tiers[0]!.deliv;

console.log(`\n  → TDEE rises light→medium→intense→double:      ${risingTdee ? "YES ✓" : "NO ✗"}`);
console.log(`  → delivered kcal rises light→...→double:       ${risingDeliv ? "YES ✓" : "NO ✗"}`);
console.log(`  → all four tier delivered kcal are DISTINCT:    ${distinct ? "YES ✓" : "NO ✗"}`);
console.log(`  → OFF (rest) delivered kcal is the lowest:      ${offLowest ? "YES ✓" : "NO ✗"}`);
console.log(`  → distinct meal plans generated:                ${result.mealPlans.size} (rest + 4 tiers = 5 expected)`);
console.log(
  `  → note: tiers clone training protein/fat ratios; intensity = TDEE + carb remainder. Multiplier VALUES are a Roberto-calibration point.\n`
);
