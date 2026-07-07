/**
 * #FIX3 — carb-floor clamp must be SURFACED, not silent.
 *
 * When protein+fat kcal alone exceed a day's target, the carb remainder goes
 * negative and floors to 0 — the achieved kcal then overshoots the target and
 * the intended deficit is under-delivered. The math is unchanged (floor stays);
 * the point is that the plan now flags it.
 *
 * Two levels:
 *  - calculateMacros sets carbFloorApplied + carbFloorKcalOver (unit, deterministic).
 *  - generatePlan surfaces an Italian assumption line for the affected day-type (e2e).
 * Non-vacuous: reverting the clamp-flag logic drops carbFloorApplied → the unit
 * test's `toBe(true)` fails and the generatePlan assumption disappears.
 */
import { describe, test, expect } from "vitest";
import { calculateMacros } from "../../engine/macros";
import { generatePlan } from "../plan-generator";
import type { BodyComposition, ClientSnapshot } from "../../engine/types";
import type { PdfClientInfo } from "../../pdf/types";

const bodyComp: BodyComposition = { bodyFatPct: 15, leanMassKg: 70, fatMassKg: 12 };
const TOTAL_WEIGHT = 82;

describe("calculateMacros — carb-floor clamp flag", () => {
  test("fires when protein+fat kcal exceed the target: carbs 0, flag + overshoot set", () => {
    // rest: proteinG=round(2.2*70)=154 (616 kcal), fatG=round(1.0*82)=82 (738 kcal) → P+F=1354
    const res = calculateMacros(1000, bodyComp, TOTAL_WEIGHT, "rest");
    expect(res.carbG).toBe(0);
    expect(res.carbFloorApplied).toBe(true);
    expect(res.carbFloorKcalOver).toBe(res.totalKcal - 1000); // ~354 kcal over target
    expect(res.carbFloorKcalOver).toBeGreaterThan(0);
  });

  test("does NOT fire on a normal target (carbs positive, no flag)", () => {
    const res = calculateMacros(2500, bodyComp, TOTAL_WEIGHT, "rest");
    expect(res.carbG).toBeGreaterThan(0);
    expect(res.carbFloorApplied).toBeUndefined();
    expect(res.carbFloorKcalOver).toBeUndefined();
  });

  test("an explicit carbG override is taken as-is (formula path not used → no flag)", () => {
    const res = calculateMacros(1000, bodyComp, TOTAL_WEIGHT, "rest", {
      absoluteOverrides: { rest: { carbG: 100 } },
    });
    expect(res.carbFloorApplied).toBeUndefined();
  });
});

describe("generatePlan — surfaces the clamp in assumptions", () => {
  const snapshot: ClientSnapshot = {
    sex: "male",
    ageYears: 31,
    weightKg: 82,
    heightCm: 178,
    bodyFatPctOverride: 16,
    dailySteps: 8000,
    occupationalLevel: "sedentary",
    weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
  };
  const clientInfo: PdfClientInfo = { fullName: "Test Atleta", planDate: "2026-07-07" };

  test("clamp fires → an Italian 'target non raggiungibile' assumption appears", () => {
    // Pin protein+fat far above any rest-day target so the carb remainder floors.
    const result = generatePlan({
      clientInfo,
      snapshot,
      engineOptions: { macroOptions: { absoluteOverrides: { rest: { proteinG: 300, fatG: 200 } } } },
    });
    expect(result.assumptions.some((a) => a.includes("Target non pienamente raggiungibile"))).toBe(true);
  });

  test("no clamp → no such assumption (control)", () => {
    const result = generatePlan({ clientInfo, snapshot });
    expect(result.assumptions.some((a) => a.includes("Target non pienamente raggiungibile"))).toBe(false);
  });
});
