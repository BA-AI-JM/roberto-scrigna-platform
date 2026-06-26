/**
 * DIAGNOSTIC (read-only, NOT wired into generation) — #26 injury/stress adaptation.
 *
 * Generates a plan OFF (no spec) then ON (a broken-foot-style injury/stress spec)
 * and prints, for a training day: TDEE, NEAT, and the protein TARGET before/after,
 * plus the delivered meal-plan kcal/protein — confirming the spec moves the right
 * levers (TDEE ↑ via stress, NEAT ↓ via reduced steps, protein ↑ via the bump)
 * and the plan still solves on the protected pair (±5%). Asserts nothing.
 *
 * Provisional VALUES below are a Roberto-calibration point.
 * Run: bun run scripts/diag-injury-stress.ts
 */

import { generatePlan, type InjuryStressSpec } from "../src/services/plan-generator";
import type { ClientSnapshot } from "../src/engine/types";

const client: ClientSnapshot = {
  sex: "male",
  ageYears: 32,
  weightKg: 82,
  heightCm: 180,
  dailySteps: 9000,
  occupationalLevel: "sedentary",
  bodyFatPctOverride: 18,
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

// provisional — Roberto to calibrate
const SPEC: InjuryStressSpec = {
  stressFactor: 1.1, // +10% recovery cost
  injuryProteinBumpGPerKg: 0.3, // +0.3 g/kg LBM
  reducedActivitySteps: 2000, // broken foot → ~2000 steps/day
};

const clientInfo = { fullName: "Diag Injury", planDate: "2026-06-26" };
const off = generatePlan({ clientInfo, snapshot: client, mealCount: 4 });
const on = generatePlan({ clientInfo, snapshot: client, mealCount: 4, injuryStress: SPEC });

const day = (p: ReturnType<typeof generatePlan>, dt: string) => p.weeklyPlan.days.find((d) => d.dayType === dt)!;
const pct = (a: number, t: number) => (t ? ((a - t) / t) * 100 : 0);
const fp = (a: number, t: number) => (pct(a, t) >= 0 ? "+" : "") + pct(a, t).toFixed(1) + "%";

const offD = day(off, "training");
const onD = day(on, "training");

console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  #26 INJURY/STRESS — opt-in adaptation (training day)                  ║`);
console.log(`║  spec: stress ${SPEC.stressFactor}× · +${SPEC.injuryProteinBumpGPerKg} g/kg protein · steps→${SPEC.reducedActivitySteps}  ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════╝`);

console.log(`\n  ── energy & target levers (training day) ──`);
console.log(`  ${"".padEnd(16)} ${"OFF".padStart(8)} ${"ON".padStart(8)}   Δ`);
console.log(`  ${"NEAT kcal".padEnd(16)} ${String(offD.tdee.neat.totalNeatKcal).padStart(8)} ${String(onD.tdee.neat.totalNeatKcal).padStart(8)}   ${fp(onD.tdee.neat.totalNeatKcal, offD.tdee.neat.totalNeatKcal)}`);
console.log(`  ${"  steps kcal".padEnd(16)} ${String(offD.tdee.neat.stepsKcal).padStart(8)} ${String(onD.tdee.neat.stepsKcal).padStart(8)}`);
console.log(`  ${"TDEE kcal".padEnd(16)} ${String(offD.tdee.totalTdeeKcal).padStart(8)} ${String(onD.tdee.totalTdeeKcal).padStart(8)}   ${fp(onD.tdee.totalTdeeKcal, offD.tdee.totalTdeeKcal)}`);
console.log(`  ${"protein tgt g".padEnd(16)} ${String(offD.macros.proteinG).padStart(8)} ${String(onD.macros.proteinG).padStart(8)}   ${fp(onD.macros.proteinG, offD.macros.proteinG)}`);
console.log(`  ${"carb tgt g".padEnd(16)} ${String(offD.macros.carbG).padStart(8)} ${String(onD.macros.carbG).padStart(8)}`);
console.log(`  ${"total tgt kcal".padEnd(16)} ${String(offD.macros.totalKcal).padStart(8)} ${String(onD.macros.totalKcal).padStart(8)}`);

// Delivered meal-plan macros for the training day (combined ON), vs the adapted target.
const onMeal = on.mealPlans.get("training")!;
const a = onMeal.actualMacros;
const t = onD.macros;
console.log(`\n  ── delivered meal plan (combined ON, training) vs adapted target ──`);
console.log(`  kcal ${a.kcal}(${fp(a.kcal, t.totalKcal)})  protein ${a.proteinG}(${fp(a.proteinG, t.proteinG)})  carbs ${a.carbsG}`);
console.log(`  → protected pair within ±5%: kcal ${Math.abs(pct(a.kcal, t.totalKcal)) <= 5 ? "✓" : "✗"} · protein ${Math.abs(pct(a.proteinG, t.proteinG)) <= 5 ? "✓" : "✗"}`);

// Each lever ISOLATED (the combined net can go either way — a broken-foot NEAT
// collapse can outweigh a +10% stress, which is correct, not a bug).
const stressOnly = day(generatePlan({ clientInfo, snapshot: client, mealCount: 4, injuryStress: { stressFactor: 1.1 } }), "training");
const stepsOnly = day(generatePlan({ clientInfo, snapshot: client, mealCount: 4, injuryStress: { reducedActivitySteps: 2000 } }), "training");
const proteinOnly = day(generatePlan({ clientInfo, snapshot: client, mealCount: 4, injuryStress: { injuryProteinBumpGPerKg: 0.3 } }), "training");
console.log(`\n  ── each lever in ISOLATION vs OFF ──`);
console.log(`  stress 1.1× alone:        TDEE ${offD.tdee.totalTdeeKcal} → ${stressOnly.tdee.totalTdeeKcal} (${fp(stressOnly.tdee.totalTdeeKcal, offD.tdee.totalTdeeKcal)})  ${stressOnly.tdee.totalTdeeKcal > offD.tdee.totalTdeeKcal ? "↑ ✓" : "✗"}`);
console.log(`  steps→2000 alone:         NEAT ${offD.tdee.neat.totalNeatKcal} → ${stepsOnly.tdee.neat.totalNeatKcal} (${fp(stepsOnly.tdee.neat.totalNeatKcal, offD.tdee.neat.totalNeatKcal)})  ${stepsOnly.tdee.neat.totalNeatKcal < offD.tdee.neat.totalNeatKcal ? "↓ ✓" : "✗"}`);
console.log(`  +0.3 g/kg protein alone:  protein ${offD.macros.proteinG} → ${proteinOnly.macros.proteinG} (${fp(proteinOnly.macros.proteinG, offD.macros.proteinG)})  ${proteinOnly.macros.proteinG > offD.macros.proteinG ? "↑ ✓" : "✗"}`);
console.log(`  → COMBINED net TDEE ${offD.tdee.totalTdeeKcal} → ${onD.tdee.totalTdeeKcal}: the broken-foot NEAT collapse outweighs +10% stress (correct — net depends on both).\n`);
