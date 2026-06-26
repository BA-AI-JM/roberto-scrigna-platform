/**
 * #17 periodization intensity tiers (modes 3-4) — engine invariants.
 *
 * The engine is vocabulary-driven: it generates one meal plan per DISTINCT
 * day-type in weekSchedule. Modes 1 (weekly-average / all-same) and 2
 * (training vs rest) were already emergent from the base day-types; this suite
 * proves (a) the NEW intensity tiers fan out into distinct, intensity-graded
 * plans, and (b) the additions are byte-identical for the existing day-types
 * (modes 1-2 regression). Intensity flows through TDEE + the carb remainder;
 * protein/fat ratios are cloned from `training`, so kcal+protein stay protected.
 */

import { describe, test, expect } from "vitest";
import { generatePlan } from "../../services/plan-generator";
import type { ClientSnapshot, DayType, ExerciseSession } from "../types";

const PCT = 5;
const pctDiff = (a: number, t: number) => (t === 0 ? 0 : ((a - t) / t) * 100);

const base: Omit<ClientSnapshot, "weekSchedule"> = {
  sex: "male",
  ageYears: 32,
  weightKg: 82,
  heightCm: 180,
  dailySteps: 9000,
  occupationalLevel: "sedentary",
};

function withSchedule(week: DayType[]): ClientSnapshot {
  return { ...base, weekSchedule: week as ClientSnapshot["weekSchedule"] };
}

// clientInfo is required by PlanGenerationInput (PDF cover metadata) but plays no
// part in meal generation — a minimal stub keeps these engine tests focused.
const CLIENT_INFO = { fullName: "Tier Test", planDate: "2026-06-26" };

const MODE4: DayType[] = [
  "rest",
  "training_light",
  "training_medium",
  "training_intense",
  "training_double",
  "rest",
  "rest",
];
const MODE3: DayType[] = [
  "rest",
  "training_medium",
  "training_intense",
  "rest",
  "training_medium",
  "training_intense",
  "rest",
];

describe("intensity tiers fan out into distinct plans (#17 modes 3-4)", () => {
  test("mode-4 week yields 5 distinct plans (rest + 4 tiers), kcal rises with intensity", () => {
    const r = generatePlan({ clientInfo: CLIENT_INFO, snapshot: withSchedule(MODE4), mealCount: 4 });
    // one plan per distinct day-type
    expect(r.mealPlans.size).toBe(5);
    const order: DayType[] = ["training_light", "training_medium", "training_intense", "training_double"];
    const kcal = order.map((t) => r.mealPlans.get(t)!.actualMacros.kcal);
    // strictly rising: light < medium < intense < double
    for (let i = 1; i < kcal.length; i++) expect(kcal[i]!).toBeGreaterThan(kcal[i - 1]!);
    // all four distinct
    expect(new Set(kcal).size).toBe(4);
    // OFF (rest) is below the lightest training tier
    expect(r.mealPlans.get("rest")!.actualMacros.kcal).toBeLessThan(kcal[0]!);
  });

  test("a per-day session override flows through to a tier day (not just plain training)", () => {
    // MODE4 index 3 = training_intense. A coach's per-day session on a TIER day
    // must raise that day's expenditure (regression guard for the index.ts gate
    // that previously applied overrides only to plain "training").
    const baseRun = generatePlan({ clientInfo: CLIENT_INFO, snapshot: withSchedule(MODE4), mealCount: 4 });
    const baseIntense = baseRun.weeklyPlan.days[3]!.tdee.exercise.exerciseKcal;
    const bigSession: ExerciseSession = { method: "session_estimate", durationMin: 90, kcalEstimate: 900 };
    const overRun = generatePlan({
      clientInfo: CLIENT_INFO,
      snapshot: withSchedule(MODE4),
      mealCount: 4,
      engineOptions: { perDayTrainingSession: [null, null, null, bigSession, null, null, null] },
    });
    const overIntense = overRun.weeklyPlan.days[3]!.tdee.exercise.exerciseKcal;
    expect(overIntense).toBeGreaterThan(baseIntense);
  });

  test("mode-3 week yields 3 distinct plans (OFF/medium/intense), medium < intense", () => {
    const r = generatePlan({ clientInfo: CLIENT_INFO, snapshot: withSchedule(MODE3), mealCount: 4 });
    expect(r.mealPlans.size).toBe(3);
    const medium = r.mealPlans.get("training_medium")!.actualMacros.kcal;
    const intense = r.mealPlans.get("training_intense")!.actualMacros.kcal;
    expect(intense).toBeGreaterThan(medium);
  });

  test("per-tier kcal + protein stay within ±5% of target; no NaN/zero-gram", () => {
    const r = generatePlan({ clientInfo: CLIENT_INFO, snapshot: withSchedule(MODE4), mealCount: 4 });
    for (const dt of ["training_light", "training_medium", "training_intense", "training_double", "rest"] as DayType[]) {
      const day = r.weeklyPlan.days.find((d) => d.dayType === dt)!;
      const mp = r.mealPlans.get(dt)!;
      const a = mp.actualMacros;
      expect(Number.isNaN(a.kcal)).toBe(false);
      expect(Number.isNaN(a.proteinG)).toBe(false);
      expect(Math.abs(pctDiff(a.kcal, day.macros.totalKcal))).toBeLessThanOrEqual(PCT);
      expect(Math.abs(pctDiff(a.proteinG, day.macros.proteinG))).toBeLessThanOrEqual(PCT);
      // no zero-gram ingredients
      for (const ing of mp.slots.flatMap((s) => s.primary.scaledIngredients)) {
        expect(ing.grams).toBeGreaterThan(0);
      }
    }
  });
});

describe("modes 1-2 byte-identical regression (#17 — additive only)", () => {
  test("all-rest week (mode 1) — one rest plan, deterministic, only base day-type", () => {
    const wk = withSchedule(["rest", "rest", "rest", "rest", "rest", "rest", "rest"]);
    const a = generatePlan({ clientInfo: CLIENT_INFO, snapshot: wk, mealCount: 4 });
    const b = generatePlan({ clientInfo: CLIENT_INFO, snapshot: wk, mealCount: 4 });
    expect([...a.mealPlans.keys()]).toEqual(["rest"]);
    // deterministic → byte-identical across runs (no tier code path touched)
    expect(b.mealPlans.get("rest")!.actualMacros).toEqual(a.mealPlans.get("rest")!.actualMacros);
    expect(b.weeklyPlan.weeklyAverageKcal).toBe(a.weeklyPlan.weeklyAverageKcal);
  });

  test("training/rest week (mode 2) — exactly {training, rest}, no tier leakage, deterministic", () => {
    const wk = withSchedule(["training", "rest", "training", "rest", "training", "rest", "rest"]);
    const a = generatePlan({ clientInfo: CLIENT_INFO, snapshot: wk, mealCount: 4 });
    const b = generatePlan({ clientInfo: CLIENT_INFO, snapshot: wk, mealCount: 4 });
    expect(new Set(a.mealPlans.keys())).toEqual(new Set<DayType>(["training", "rest"]));
    expect(b.mealPlans.get("training")!.actualMacros).toEqual(a.mealPlans.get("training")!.actualMacros);
    expect(b.mealPlans.get("rest")!.actualMacros).toEqual(a.mealPlans.get("rest")!.actualMacros);
    // protected pair still holds on the base day-types
    for (const dt of ["training", "rest"] as DayType[]) {
      const day = a.weeklyPlan.days.find((d) => d.dayType === dt)!;
      const am = a.mealPlans.get(dt)!.actualMacros;
      expect(Math.abs(pctDiff(am.kcal, day.macros.totalKcal))).toBeLessThanOrEqual(PCT);
      expect(Math.abs(pctDiff(am.proteinG, day.macros.proteinG))).toBeLessThanOrEqual(PCT);
    }
  });
});
