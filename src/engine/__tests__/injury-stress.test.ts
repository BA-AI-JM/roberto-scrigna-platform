/**
 * #26 injury/stress adaptation — engine invariants.
 *
 * An OPT-IN per-plan spec that alters the ENERGY engine: a stress multiplier on
 * TDEE, a reduced-NEAT step input, and an additive protein-per-kg bump. The hard
 * safety property is REGRESSION: with the spec ABSENT (or all fields nullish), the
 * output is byte-identical to today — which is why the existing fidelity /
 * prescription tests stay untouched. These tests cover (a) that regression and
 * (b) each lever moving its target as specified, with the protected pair (±5%)
 * still holding. Provisional VALUES are a Roberto-calibration point.
 */

import { describe, test, expect } from "vitest";
import { calculateTdee, calculateMacros, estimateBodyFat } from "../index";
import { generatePlan, type InjuryStressSpec } from "../../services/plan-generator";
import type { ClientSnapshot } from "../types";

const snap: ClientSnapshot = {
  sex: "male",
  ageYears: 32,
  weightKg: 82,
  heightCm: 180,
  dailySteps: 9000,
  occupationalLevel: "sedentary",
  bodyFatPctOverride: 18,
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};
const bodyComp = estimateBodyFat(snap).bodyComposition;
const clientInfo = { fullName: "Test", planDate: "2026-06-26" };

describe("stress multiplier on TDEE (#26)", () => {
  test("stressFactor 1.1 raises total TDEE ~10%; absent/1 is byte-identical", () => {
    const off = calculateTdee(snap, "training").totalTdeeKcal;
    const on = calculateTdee(snap, "training", { stressFactor: 1.1 }).totalTdeeKcal;
    expect(on).toBe(Math.round(off * 1.1));
    expect(calculateTdee(snap, "training", { stressFactor: 1 }).totalTdeeKcal).toBe(off); // byte-identical
    expect(calculateTdee(snap, "training", {}).totalTdeeKcal).toBe(off);
  });
});

describe("reduced-activity steps → lower NEAT (#26)", () => {
  test("reducedActivitySteps lowers NEAT; absent or equal-to-snapshot is byte-identical", () => {
    const off = calculateTdee(snap, "rest");
    const on = calculateTdee(snap, "rest", { reducedActivitySteps: 2000 });
    expect(on.neat.totalNeatKcal).toBeLessThan(off.neat.totalNeatKcal);
    expect(on.totalTdeeKcal).toBeLessThan(off.totalTdeeKcal); // less NEAT → less TDEE
    // absent + equal-to-snapshot both reproduce the baseline exactly
    expect(calculateTdee(snap, "rest", {}).neat.totalNeatKcal).toBe(off.neat.totalNeatKcal);
    expect(calculateTdee(snap, "rest", { reducedActivitySteps: snap.dailySteps }).neat.totalNeatKcal).toBe(off.neat.totalNeatKcal);
  });
});

describe("injury protein bump (#26)", () => {
  test("injuryProteinBumpGPerKg adds to the per-kg rate; 0/absent is byte-identical", () => {
    const off = calculateMacros(2600, bodyComp, snap.weightKg, "training").proteinG;
    const on = calculateMacros(2600, bodyComp, snap.weightKg, "training", { injuryProteinBumpGPerKg: 0.3 }).proteinG;
    expect(on).toBe(Math.round((2.5 + 0.3) * bodyComp.leanMassKg)); // training rate 2.5 + 0.3
    expect(on).toBeGreaterThan(off);
    expect(calculateMacros(2600, bodyComp, snap.weightKg, "training", { injuryProteinBumpGPerKg: 0 }).proteinG).toBe(off);
    expect(calculateMacros(2600, bodyComp, snap.weightKg, "training", {}).proteinG).toBe(off);
  });

  test("an absolute per-day-type override still wins over the bump (formula-only effect)", () => {
    const m = calculateMacros(2600, bodyComp, snap.weightKg, "training", {
      injuryProteinBumpGPerKg: 0.3,
      absoluteOverrides: { training: { proteinG: 200 } },
    });
    expect(m.proteinG).toBe(200); // override pins; bump ignored on that branch
  });
});

describe("generatePlan — regression + with-spec (#26)", () => {
  function plan(injuryStress?: InjuryStressSpec) {
    return generatePlan({ clientInfo, snapshot: snap, mealCount: 4, ...(injuryStress ? { injuryStress } : {}) });
  }

  test("absent spec === empty spec === byte-identical (KEY regression)", () => {
    const off = plan();
    const emptyA = generatePlan({ clientInfo, snapshot: snap, mealCount: 4, injuryStress: {} });
    const emptyB = generatePlan({ clientInfo, snapshot: snap, mealCount: 4, injuryStress: { stressFactor: 1 } });
    // Compare the engine outputs (weeklyPlan = TDEE/macros) — must be identical.
    expect(emptyA.weeklyPlan).toEqual(off.weeklyPlan);
    expect(emptyB.weeklyPlan).toEqual(off.weeklyPlan);
    expect(emptyA.assumptions).toEqual(off.assumptions); // no spurious assumption line
  });

  test("with-spec moves TDEE/protein and the delivered plan holds the protected pair ±5%; no NaN/zero-gram", () => {
    const off = plan();
    const on = plan({ stressFactor: 1.1, injuryProteinBumpGPerKg: 0.3, reducedActivitySteps: 2000 });
    const offT = off.weeklyPlan.days.find((d) => d.dayType === "training")!;
    const onT = on.weeklyPlan.days.find((d) => d.dayType === "training")!;
    expect(onT.macros.proteinG).toBeGreaterThan(offT.macros.proteinG); // protein bump
    expect(onT.tdee.neat.totalNeatKcal).toBeLessThan(offT.tdee.neat.totalNeatKcal); // reduced steps

    const meal = on.mealPlans.get("training")!;
    const a = meal.actualMacros;
    const t = onT.macros;
    expect(Number.isNaN(a.kcal)).toBe(false);
    expect(Math.abs((a.kcal - t.totalKcal) / t.totalKcal) * 100).toBeLessThanOrEqual(5);
    expect(Math.abs((a.proteinG - t.proteinG) / t.proteinG) * 100).toBeLessThanOrEqual(5);
    for (const ing of meal.slots.flatMap((s) => s.primary.scaledIngredients)) {
      expect(ing.grams).toBeGreaterThan(0);
    }
  });

  test("a generated assumption documents the adaptation when active", () => {
    const on = plan({ stressFactor: 1.1, injuryProteinBumpGPerKg: 0.3, reducedActivitySteps: 2000 });
    expect(on.assumptions.some((a) => /infortunio\/stress/i.test(a))).toBe(true);
  });
});
