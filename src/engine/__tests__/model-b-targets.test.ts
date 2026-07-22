/**
 * B-eng2 / R14 Model B (Roberto 2026-07-22): coach chooses weekly-average or
 * per-day; per-day target override may exceed expenditure (a refeed), and the
 * surplus lands in carbs (protein/fat are body-fixed, carbs are the remainder).
 */
import { describe, test, expect } from "vitest";
import { generateWeeklyPlan } from "../index";
import type { ClientSnapshot } from "../types";

const SNAP: ClientSnapshot = {
  sex: "male", ageYears: 30, weightKg: 85, heightCm: 180,
  dailySteps: 8000, occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "rest", "rest", "rest"],
};

describe("Model B — periodization strategy + per-day target override", () => {
  test("default (differentiated): training and rest days have DIFFERENT targets", () => {
    const p = generateWeeklyPlan(SNAP, {});
    const train = p.days[0].macros.totalKcal;
    const rest = p.days[1].macros.totalKcal;
    expect(train).toBeGreaterThan(rest); // training day burns more → higher target
  });

  test("weekly_average: EVERY day targets the same (mean) kcal", () => {
    const p = generateWeeklyPlan(SNAP, { periodizationStrategy: "weekly_average" });
    const targets = p.days.map((d) => d.macros.totalKcal);
    const first = targets[0]!;
    for (const t of targets) expect(Math.abs(t - first)).toBeLessThanOrEqual(2); // rounding only
  });

  test("per-day override ABOVE expenditure → that day's target rises; surplus → carbs", () => {
    const base = generateWeeklyPlan(SNAP, {});
    const restExp = base.days[1].tdee.totalTdeeKcal; // rest day expenditure
    const overrides = [null, restExp + 600, null, null, null, null, null];
    const p = generateWeeklyPlan(SNAP, { perDayTargetKcalOverride: overrides });
    const day = p.days[1].macros;
    expect(day.totalKcal).toBeCloseTo(restExp + 600, -1); // target = override (a surplus)
    // protein & fat unchanged vs baseline; the +600 landed in carbs
    expect(day.proteinG).toBeCloseTo(base.days[1].macros.proteinG, 0);
    expect(day.fatG).toBeCloseTo(base.days[1].macros.fatG, 0);
    expect(day.carbG - base.days[1].macros.carbG).toBeCloseTo(150, -1); // 600 kcal / 4
  });

  test("a per-day override WINS over weekly_average", () => {
    const overrides = [null, 3500, null, null, null, null, null];
    const p = generateWeeklyPlan(SNAP, { periodizationStrategy: "weekly_average", perDayTargetKcalOverride: overrides });
    expect(p.days[1].macros.totalKcal).toBeCloseTo(3500, -1);
  });
});
