/**
 * Macro reconciliation regression (#21).
 *
 * Roberto reported a critical inconsistency: a plan prescribed ~165 g protein
 * but the generated meal plan summed well over target, with the same suspected
 * for fat and carbs. Root cause (confirmed): every meal is one template scaled
 * by a single weighted-average factor clamped to [0.7, 1.4], the template pool
 * is uniformly protein-dense, and nothing reconciled the SUM of delivered
 * portions back to the daily prescription (`tightenPlan` only touched one slot).
 *
 * This suite asserts the invariant that should always hold and never was tested:
 *   sum(delivered P/F/C across all meals) ≈ prescription, within TOLERANCE_PCT.
 *
 * It is deliberately independent of the per-day tolerance BANDS (±10 g etc.):
 * those are absolute and pass trivially on small plans; this checks the
 * proportional reconciliation Roberto actually complained about.
 *
 * BEFORE the fix, all of these failed (e.g. the moderate-cut case below
 * delivered P −5.5%, F −12.0%, C +12.8%). AFTER the reconciliation pass they
 * land within tolerance — for prescriptions inside the achievable envelope.
 *
 * STRUCTURAL CEILING: the template pool is protein-dense (main meals carry
 * carb:protein ≈ 1.3). A prescription whose carb:protein ratio exceeds ~1.4
 * cannot be met within ±5% on both protein AND carbs no matter how the plan is
 * reconciled — at 1.4× scale the pool simply cannot carry enough carbohydrate
 * without overshooting protein. Roberto's reported 165P/300C (ratio 1.8) sits
 * here, as do the engine's own high-carb prescriptions. Closing that residual
 * needs carb-dense filler foods / per-ingredient macros — see
 * CORRECTIONS-TRIAGE.md #10. The dedicated ceiling test documents the partial
 * (but material) improvement the reconciler still delivers there.
 */

import { describe, test, expect } from "vitest";
import { createMealPlan } from "../planner";
import { RECONCILE_TOLERANCE_PCT } from "../reconcile";
import type { MealPlanConfig } from "../types";
import type { MacroTargets } from "../../types";
import { ALL_TEMPLATES } from "../../../data/meals/templates";

// Tolerance pending Roberto sign-off (#21)
const TOLERANCE_PCT = RECONCILE_TOLERANCE_PCT;

/** Build a MacroTargets from grams (kcal derived 4/4/9, like the engine). */
function rx(
  proteinG: number,
  fatG: number,
  carbG: number,
  dayType: MacroTargets["dayType"] = "training"
): MacroTargets {
  return {
    proteinG,
    fatG,
    carbG,
    totalKcal: proteinG * 4 + carbG * 4 + fatG * 9,
    dayType,
  };
}

function pctDiff(actual: number, target: number): number {
  if (target === 0) return actual === 0 ? 0 : 100;
  return ((actual - target) / target) * 100;
}

function fmt(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

// ── Achievable envelope — the forward regression guard ──────────────────────
// Realistic cut / maintenance prescriptions (carb:protein ≲ 1.4). All of these
// drifted out of tolerance before the reconciliation pass.
const CASES: { label: string; macros: MacroTargets; mealCount: number }[] = [
  // PROVEN fail→pass: pre-fix delivered P 151.2g (−5.5%), F 61.6g (−12.0%),
  // C 203g (+12.8%); post-fix all within ±2%.
  { label: "moderate cut 160P/180C (3 meals)", macros: rx(160, 70, 180, "rest"), mealCount: 3 },
  { label: "Roberto-style cut 165P/210C (4 meals)", macros: rx(165, 70, 210), mealCount: 4 },
  { label: "rest day 155P/190C (4 meals)", macros: rx(155, 65, 190, "rest"), mealCount: 4 },
  { label: "balanced 150P/205C (5 meals)", macros: rx(150, 60, 205), mealCount: 5 },
  { label: "lean-gain 175P/230C (6 meals)", macros: rx(175, 75, 230), mealCount: 6 },
];

describe("Macro reconciliation: delivered totals match prescription (#21)", () => {
  for (const { label, macros, mealCount } of CASES) {
    test(`${label} — summed portions within ±${TOLERANCE_PCT}% of prescription`, () => {
      const config: MealPlanConfig = {
        dayType: macros.dayType,
        macroTargets: macros,
        mealCount,
        substitutionsPerSlot: 3,
      };

      const plan = createMealPlan(ALL_TEMPLATES, config);
      const got = plan.actualMacros; // summed across all primary selections

      const pP = pctDiff(got.proteinG, macros.proteinG);
      const pF = pctDiff(got.fatG, macros.fatG);
      const pC = pctDiff(got.carbsG, macros.carbG);

      const summary =
        `\n  prescription → P ${macros.proteinG}g  F ${macros.fatG}g  C ${macros.carbG}g  (${macros.totalKcal} kcal)` +
        `\n  delivered    → P ${got.proteinG}g (${fmt(pP)})  F ${got.fatG}g (${fmt(pF)})  C ${got.carbsG}g (${fmt(pC)})  (${got.kcal} kcal)`;

      expect(Math.abs(pP), `PROTEIN out of tolerance${summary}`).toBeLessThanOrEqual(TOLERANCE_PCT);
      expect(Math.abs(pF), `FAT out of tolerance${summary}`).toBeLessThanOrEqual(TOLERANCE_PCT);
      expect(Math.abs(pC), `CARBS out of tolerance${summary}`).toBeLessThanOrEqual(TOLERANCE_PCT);
    });
  }
});

// ── Structural ceiling — Roberto's exact reported scenario ──────────────────
// 165P / 300C (carb:protein 1.8) is outside the achievable envelope: the
// protein-dense template pool cannot carry 300 g carbs across the day without
// overshooting protein. We do NOT assert ±5% here (it is physically
// unreachable without carb-dense foods — #10); we assert the reconciler still
// materially closes the gap versus the old blind kcal-driven scaler, which
// delivered only ~218 g carbs (−27%).
describe("Macro reconciliation: structural ceiling (#21, needs carb-dense foods #10)", () => {
  test("165P/300C — reconciliation lifts carbs well above the pre-fix ~218g, kcal within 12%", () => {
    const macros = rx(165, 70, 300);
    const plan = createMealPlan(ALL_TEMPLATES, {
      dayType: macros.dayType,
      macroTargets: macros,
      mealCount: 4,
      substitutionsPerSlot: 3,
    });
    const got = plan.actualMacros;

    // Pre-fix blind scaler delivered carbsG ≈ 218 (−27.3%). Reconciliation must
    // do materially better (it reaches ~252, −16%). Floor at 240 g (−20%) as a
    // stable improvement guard; still short of the ±5% the pool can't provide.
    expect(
      got.carbsG,
      `carbs should be lifted toward target (pre-fix ~218g): got ${got.carbsG}g`
    ).toBeGreaterThanOrEqual(240);

    // Total energy should track the prescription closely even when the macro
    // split can't be hit exactly.
    expect(
      Math.abs(pctDiff(got.kcal, macros.totalKcal)),
      `kcal drift: prescribed ${macros.totalKcal}, got ${got.kcal}`
    ).toBeLessThanOrEqual(12);
  });
});
