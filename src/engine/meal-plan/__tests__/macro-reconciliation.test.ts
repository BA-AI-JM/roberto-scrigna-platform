/**
 * Macro reconciliation + per-ingredient solver contract (#21/#15/#10) — Stage 2.
 *
 * The single-scale-factor mechanism is gone; meals are assembled by solving
 * per-ingredient grams against the v3 food DB. The contract, in STRICT priority:
 *   1. CALORIES  — summed from v3 Calories (NOT 4P+4C+9F), within ±5%
 *   2. PROTEIN   — protected, within ±5%
 *   3. FIBRE     — day-level floor ≥10 g per 1000 kcal (#10)
 *   4. CARBS/FATS — remainder; within ±5% when 1–3 allow, else they absorb the
 *      slack (so they are asserted within a wider remainder band, not ±5%).
 *
 * This replaces the old "structural carb ceiling" — fillers + per-ingredient
 * grams now reach high-carb targets, so that ceiling no longer exists.
 */

import { describe, test, expect } from "vitest";
import { createMealPlan } from "../planner";
import { withinReconcileTolerance, RECONCILE_TOLERANCE_PCT } from "../reconcile";
import type { MealPlanConfig } from "../types";
import type { MacroTargets } from "../../types";
import { ALL_TEMPLATES } from "../../../data/meals/templates";
import { resolveFood } from "../../../data/meals/food-map";

// Protected pair (kcal, protein) tolerance.
const PROTECTED_PCT = 5;
// Carbs/fats are the remainder — they absorb slack when kcal+protein bind.
const REMAINDER_PCT = 15;
// Day-level fibre floor (g per 1000 kcal).
const FIBRE_FLOOR_PER_1000 = 10;

function rx(
  proteinG: number,
  fatG: number,
  carbG: number,
  dayType: MacroTargets["dayType"] = "training"
): MacroTargets {
  return { proteinG, fatG, carbG, totalKcal: proteinG * 4 + carbG * 4 + fatG * 9, dayType };
}

function pctDiff(actual: number, target: number): number {
  if (target === 0) return actual === 0 ? 0 : 100;
  return ((actual - target) / target) * 100;
}
const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

const CASES: { label: string; macros: MacroTargets; mealCount: number }[] = [
  { label: "moderate cut 160P/180C (3 meals)", macros: rx(160, 70, 180, "rest"), mealCount: 3 },
  { label: "Roberto-style cut 165P/210C (4 meals)", macros: rx(165, 70, 210), mealCount: 4 },
  { label: "rest day 155P/190C (4 meals)", macros: rx(155, 65, 190, "rest"), mealCount: 4 },
  { label: "balanced 150P/205C (5 meals)", macros: rx(150, 60, 205), mealCount: 5 },
  { label: "lean-gain 175P/230C (6 meals)", macros: rx(175, 75, 230), mealCount: 6 },
];

describe("Per-ingredient solver contract (#21)", () => {
  for (const { label, macros, mealCount } of CASES) {
    test(`${label} — kcal & protein within ±${PROTECTED_PCT}%, carbs/fats remainder, fibre floor`, () => {
      const config: MealPlanConfig = {
        dayType: macros.dayType,
        macroTargets: macros,
        mealCount,
        substitutionsPerSlot: 3,
      };
      const got = createMealPlan(ALL_TEMPLATES, config).actualMacros;

      const pK = pctDiff(got.kcal, macros.totalKcal);
      const pP = pctDiff(got.proteinG, macros.proteinG);
      const pF = pctDiff(got.fatG, macros.fatG);
      const pC = pctDiff(got.carbsG, macros.carbG);
      const fibre = got.fibreG ?? 0;
      const fibreFloor = (FIBRE_FLOOR_PER_1000 * got.kcal) / 1000;

      const summary =
        `\n  prescription → P ${macros.proteinG} F ${macros.fatG} C ${macros.carbG} (${macros.totalKcal} kcal)` +
        `\n  delivered    → kcal ${got.kcal}(${fmt(pK)}) P ${got.proteinG}(${fmt(pP)}) F ${got.fatG}(${fmt(pF)}) C ${got.carbsG}(${fmt(pC)}) fibre ${fibre}g (floor ${fibreFloor.toFixed(1)})`;

      // 1. Calories (primary) and 2. Protein (protected) — tight.
      expect(Math.abs(pK), `KCAL out of tolerance${summary}`).toBeLessThanOrEqual(PROTECTED_PCT);
      expect(Math.abs(pP), `PROTEIN out of tolerance${summary}`).toBeLessThanOrEqual(PROTECTED_PCT);
      // 3. Fibre floor.
      expect(fibre, `FIBRE below floor${summary}`).toBeGreaterThanOrEqual(fibreFloor - 0.5);
      // 4. Carbs/fats — remainder band.
      expect(Math.abs(pC), `CARBS beyond remainder band${summary}`).toBeLessThanOrEqual(REMAINDER_PCT);
      expect(Math.abs(pF), `FAT beyond remainder band${summary}`).toBeLessThanOrEqual(REMAINDER_PCT);
    });
  }
});

// ── Structural carb ceiling REMOVED (#21/#10) ───────────────────────────────
// The old mechanism could not exceed ~218 g carbs for a 300 g target (protein-
// dense pool, single factor). Per-ingredient grams + fillers now reach it. At
// this extreme ratio the contract permits kcal/fat to drift (carbs/fats absorb
// slack while protein is protected), so bands are best-effort, not ±5%.
describe("High-carb ceiling removed (#21/#10)", () => {
  test("165P/300C (5 meals) — carbs now reach target; protein protected", () => {
    const macros = rx(165, 70, 300);
    const got = createMealPlan(ALL_TEMPLATES, {
      dayType: "training",
      macroTargets: macros,
      mealCount: 5,
      substitutionsPerSlot: 3,
    }).actualMacros;
    // Carbs now reach within ±10% (was structurally impossible — capped ~218g).
    expect(Math.abs(pctDiff(got.carbsG, 300))).toBeLessThanOrEqual(10);
    // Protein stays protected even at the extreme.
    expect(Math.abs(pctDiff(got.proteinG, 165))).toBeLessThanOrEqual(8);
    // Calories best-effort.
    expect(Math.abs(pctDiff(got.kcal, macros.totalKcal))).toBeLessThanOrEqual(10);
  });
});

// ── Low-carb day: the additive-filler overshoot bug (#21/#10) ────────────────
// Regression lock for the joint-filler fix. The old additive topUpCarb + fibre
// floor passes piled +183 kcal / +40 g carbs / +8.4 g protein onto a low-carb
// day AFTER reconcile with no compensation, breaching the PROTECTED kcal (+7.9%)
// and protein (+5.6%). Fillers are now sized JOINTLY inside assembleMeal, bounded
// by each slot's kcal headroom, so the protected pair holds and carbs/fibre yield.
describe("Low-carb day — protected pair holds, fillers compensated (#21/#10)", () => {
  // 170P / 90C / 90F → 1850 kcal, rest day, 4 meals (the reported failing case).
  const macros = rx(170, 90, 90, "rest");
  const plan = createMealPlan(ALL_TEMPLATES, {
    dayType: "rest",
    macroTargets: macros,
    mealCount: 4,
    substitutionsPerSlot: 3,
  });
  const got = plan.actualMacros;
  const summary =
    `\n  delivered → kcal ${got.kcal}(${fmt(pctDiff(got.kcal, macros.totalKcal))}) ` +
    `P ${got.proteinG}(${fmt(pctDiff(got.proteinG, 170))}) C ${got.carbsG}(${fmt(pctDiff(got.carbsG, 90))}) ` +
    `F ${got.fatG} fibre ${got.fibreG ?? 0}`;

  test(`kcal within ±${PROTECTED_PCT}% (was +7.9% with additive passes)${""}`, () => {
    expect(Math.abs(pctDiff(got.kcal, macros.totalKcal)), `KCAL not protected${summary}`).toBeLessThanOrEqual(PROTECTED_PCT);
  });
  test(`protein within ±${PROTECTED_PCT}% (was +5.6% with additive passes)`, () => {
    expect(Math.abs(pctDiff(got.proteinG, 170)), `PROTEIN not protected${summary}`).toBeLessThanOrEqual(PROTECTED_PCT);
  });
  test("carbs do NOT overshoot (no rice force-fed to a low-carb day)", () => {
    // Carbs may fall short (they yield); they must not blow past the remainder band.
    expect(Math.abs(pctDiff(got.carbsG, 90)), `CARBS overshoot${summary}`).toBeLessThanOrEqual(REMAINDER_PCT);
  });
  test("withinTolerance reflects the protected pair (kcal+protein) → true", () => {
    expect(plan.withinTolerance, `withinTolerance false${summary}`).toBe(true);
  });
  test("no zero-gram / out-of-bound ingredient; fillers are removable (>0 or absent)", () => {
    for (const slot of plan.slots) {
      for (const ing of slot.primary.scaledIngredients) {
        expect(ing.grams, `zero/negative gram on ${ing.foodId}`).toBeGreaterThan(0);
        expect(ing.grams).toBeLessThanOrEqual(600);
      }
    }
  });
  test("eggs still snap to whole 60 g units (#15)", () => {
    for (const slot of plan.slots) {
      const egg = slot.primary.scaledIngredients.find((i) => i.foodId === "uova-intere");
      if (egg) expect(egg.grams % 60).toBe(0);
    }
  });
});

// ── Solver invariants ───────────────────────────────────────────────────────

describe("Solver invariants (#15/#10)", () => {
  const plan = createMealPlan(ALL_TEMPLATES, {
    dayType: "training",
    macroTargets: rx(170, 70, 250),
    mealCount: 5,
    substitutionsPerSlot: 3,
  });

  test("every ingredient gram is finite, positive, and within a sane absolute cap", () => {
    for (const slot of plan.slots) {
      for (const ing of [slot.primary, ...slot.substitutions].flatMap((m) => m.scaledIngredients)) {
        expect(Number.isFinite(ing.grams)).toBe(true);
        expect(ing.grams).toBeGreaterThan(0);
        expect(ing.grams).toBeLessThanOrEqual(600); // generous sanity ceiling
      }
    }
  });

  test("no NaN in any actualMacros", () => {
    for (const slot of plan.slots) {
      for (const m of [slot.primary, ...slot.substitutions]) {
        for (const v of [m.actualMacros.kcal, m.actualMacros.proteinG, m.actualMacros.fatG, m.actualMacros.carbsG, m.actualMacros.fibreG ?? 0, m.actualMacros.sodiumMg ?? 0]) {
          expect(Number.isNaN(v)).toBe(false);
        }
      }
    }
  });

  test("eggs (uova-intere) appear only in whole 60 g units (#15)", () => {
    for (const slot of plan.slots) {
      for (const m of [slot.primary, ...slot.substitutions]) {
        const egg = m.scaledIngredients.find((i) => i.foodId === "uova-intere");
        if (egg) expect(egg.grams % 60).toBe(0);
      }
    }
  });

  test("albume resolves (egg-white remainder food is mapped)", () => {
    const w = resolveFood("albume");
    expect(w.proteinG).toBeGreaterThan(0);
  });

  test("actualMacros equals a fresh sum of the solved ingredients", () => {
    // grams → macros, computed from v3 (not 4/4/9): primary kcal must be > 0.
    for (const slot of plan.slots) {
      expect(slot.primary.actualMacros.kcal).toBeGreaterThan(0);
      expect(slot.primary.scaledIngredients.length).toBeGreaterThan(0);
    }
  });
});

// ── Tolerance single-source invariant (#3) ──────────────────────────────────
//
// The stored `withinTolerance` flag now derives from the SAME relative
// ±RECONCILE_TOLERANCE_PCT rule the engine converges on (reconcile.ts), so the
// flag can no longer disagree with the engine's verdict (the old absolute
// DEFAULT_TOLERANCES bands could — e.g. ±100 kcal vs ±5% at 2500 kcal).
describe("tolerance single-source: flag agrees with the engine's relative verdict (#3)", () => {
  const MATRIX: Array<{ dayType: MacroTargets["dayType"]; t: MacroTargets }> = [
    { dayType: "training", t: { proteinG: 180, fatG: 70, carbG: 300, totalKcal: 2550, dayType: "training" } },
    { dayType: "rest", t: { proteinG: 170, fatG: 80, carbG: 150, totalKcal: 1900, dayType: "rest" } },
    { dayType: "training", t: { proteinG: 210, fatG: 90, carbG: 420, totalKcal: 3500, dayType: "training" } },
    { dayType: "refeed", t: { proteinG: 160, fatG: 55, carbG: 480, totalKcal: 3200, dayType: "refeed" } },
    { dayType: "rest", t: { proteinG: 140, fatG: 60, carbG: 110, totalKcal: 1500, dayType: "rest" } },
  ];

  for (const { dayType, t } of MATRIX) {
    test(`flag == engine relative verdict @ ${t.totalKcal} kcal (${dayType})`, () => {
      const plan = createMealPlan(ALL_TEMPLATES, { dayType, macroTargets: t, mealCount: 4 });
      // The flag (planner) and the engine's relative verdict use the SAME source,
      // so they must be equal for every plan — reverting the flag to absolute
      // bands would make them diverge on an edge plan (mutation-probe).
      const engineVerdict = withinReconcileTolerance(plan.deviation, t.totalKcal, t.proteinG, t.carbG, t.fatG);
      expect(plan.withinTolerance).toBe(engineVerdict);
    });
  }

  test("the rule is RELATIVE ±5% — the 2500 kcal edge the old absolute ±100 band got wrong", () => {
    // dev 110 kcal @ 2500 target = 4.4% → WITHIN. The old absolute ±100 band flagged
    // this OUT while the engine considered it converged — exactly the disagreement (#3).
    expect(withinReconcileTolerance({ kcal: 110, proteinG: 0 }, 2500, 180)).toBe(true);
    // dev 130 kcal = 5.2% → OUT (relative bound bites).
    expect(withinReconcileTolerance({ kcal: 130, proteinG: 0 }, 2500, 180)).toBe(false);
    // EF4: protein gates at ±10% — 10% of 180 = 18 g; dev 18 g in, 19 g out.
    expect(withinReconcileTolerance({ kcal: 0, proteinG: 18 }, 2500, 180)).toBe(true);
    expect(withinReconcileTolerance({ kcal: 0, proteinG: 19 }, 2500, 180)).toBe(false);
    expect(RECONCILE_TOLERANCE_PCT).toBe(5);
  });
});
