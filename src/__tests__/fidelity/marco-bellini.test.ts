/**
 * Fidelity test: Marco Bellini (worked example).
 *
 * Male, 31y, 82kg, 178cm, BF% override 16%, 8000 steps/day, sedentary.
 * Week schedule: T/R/T/R/T/R/R
 *
 * Verifies ALL intermediate and final numbers through the calculation pipeline:
 * body fat → BMR → NEAT → TEF → exercise → TDEE → macros → hydration.
 */

import {
  estimateBodyFat,
  calculateBmr,
  calculateNeat,
  calculateTef,
  calculateExercise,
  restDayExercise,
  calculateTdee,
  calculateMacros,
  calculateHydration,
  generateDailyPlan,
  generateWeeklyPlan,
  type ClientSnapshot,
} from "../../engine/index";
import { computeGoalRate } from "../../engine/goal-rate";

// ── Fixture ─────────────────────────────────────────────────────────────────

const marco: ClientSnapshot = {
  sex: "male",
  ageYears: 31,
  weightKg: 82,
  heightCm: 178,
  bodyFatPctOverride: 16,
  dailySteps: 8000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

// ── Body Fat ────────────────────────────────────────────────────────────────

describe("Marco Bellini — Body Fat", () => {
  test("override method selected", () => {
    const bf = estimateBodyFat(marco);
    expect(bf.method).toBe("override");
  });

  test("body fat = 16%", () => {
    const bf = estimateBodyFat(marco);
    expect(bf.bodyComposition.bodyFatPct).toBe(16);
  });

  test("lean mass = 68.88 kg", () => {
    const bf = estimateBodyFat(marco);
    expect(bf.bodyComposition.leanMassKg).toBe(68.88);
  });

  test("fat mass = 13.12 kg", () => {
    const bf = estimateBodyFat(marco);
    expect(bf.bodyComposition.fatMassKg).toBe(13.12);
  });

  test("lean + fat = total weight", () => {
    const bf = estimateBodyFat(marco);
    const total = bf.bodyComposition.leanMassKg + bf.bodyComposition.fatMassKg;
    expect(total).toBeCloseTo(82, 1);
  });
});

// ── BMR ─────────────────────────────────────────────────────────────────────

describe("Marco Bellini — BMR", () => {
  test("BMR = 1858 kcal (Katch-McArdle: 370 + 21.6 * 68.88)", () => {
    const bf = estimateBodyFat(marco);
    const bmr = calculateBmr(bf);
    // 370 + 21.6 * 68.88 = 370 + 1487.808 = 1857.808 ≈ 1858
    expect(bmr.bmrKcal).toBe(1858);
  });
});

// ── NEAT ────────────────────────────────────────────────────────────────────

describe("Marco Bellini — NEAT", () => {
  test("steps kcal = 328 (8000 * 0.0005 * 82)", () => {
    const neat = calculateNeat(8000, 82, "sedentary");
    expect(neat.stepsKcal).toBe(328);
  });

  test("occupational kcal = 0 (sedentary)", () => {
    const neat = calculateNeat(8000, 82, "sedentary");
    expect(neat.occupationalKcal).toBe(0);
  });

  test("total NEAT = 328", () => {
    const neat = calculateNeat(8000, 82, "sedentary");
    expect(neat.totalNeatKcal).toBe(328);
  });
});

// ── Exercise ────────────────────────────────────────────────────────────────

describe("Marco Bellini — Exercise", () => {
  test("training day exercise = 255 kcal (300 * 0.85)", () => {
    const tdee = calculateTdee(marco, "training");
    expect(tdee.exercise.exerciseKcal).toBe(255);
    expect(tdee.exercise.methodUsed).toBe("default_estimate");
    expect(tdee.exercise.recalibrationFactor).toBe(0.85);
  });

  test("rest day exercise = 0 kcal", () => {
    const tdee = calculateTdee(marco, "rest");
    expect(tdee.exercise.exerciseKcal).toBe(0);
  });
});

// ── TEF ─────────────────────────────────────────────────────────────────────

describe("Marco Bellini — TEF", () => {
  test("training day TEF = 186 kcal (10% of BMR = 10% of 1858)", () => {
    const tdee = calculateTdee(marco, "training");
    expect(tdee.tef.tefPct).toBe(10);
    expect(tdee.tef.tefKcal).toBe(186);
  });

  test("rest day TEF = 186 kcal (10% of BMR = 10% of 1858)", () => {
    const tdee = calculateTdee(marco, "rest");
    expect(tdee.tef.tefPct).toBe(10);
    expect(tdee.tef.tefKcal).toBe(186);
  });
});

// ── TDEE ────────────────────────────────────────────────────────────────────

describe("Marco Bellini — TDEE", () => {
  test("training TDEE = 2627 kcal (1858 + 328 + 255 + 186)", () => {
    const tdee = calculateTdee(marco, "training");
    expect(tdee.totalTdeeKcal).toBe(2627);
  });

  test("rest TDEE = 2372 kcal (1858 + 328 + 0 + 186)", () => {
    const tdee = calculateTdee(marco, "rest");
    expect(tdee.totalTdeeKcal).toBe(2372);
  });

  test("training TDEE = BMR + NEAT + exercise + TEF", () => {
    const tdee = calculateTdee(marco, "training");
    const sum = tdee.bmr.bmrKcal + tdee.neat.totalNeatKcal + tdee.exercise.exerciseKcal + tdee.tef.tefKcal;
    expect(sum).toBe(1858 + 328 + 255 + 186);
    expect(tdee.totalTdeeKcal).toBe(sum);
  });

  test("rest TDEE = BMR + NEAT + 0 + TEF", () => {
    const tdee = calculateTdee(marco, "rest");
    const sum = tdee.bmr.bmrKcal + tdee.neat.totalNeatKcal + tdee.exercise.exerciseKcal + tdee.tef.tefKcal;
    expect(sum).toBe(1858 + 328 + 0 + 186);
    expect(tdee.totalTdeeKcal).toBe(sum);
  });
});

// ── Macros ──────────────────────────────────────────────────────────────────

describe("Marco Bellini — Macros (Training)", () => {
  const bf = estimateBodyFat(marco);
  const macros = calculateMacros(2627, bf.bodyComposition, 82, "training");

  test("protein = 172g (2.5 * 68.88 = 172.2 ≈ 172)", () => {
    expect(macros.proteinG).toBe(172);
  });

  test("fat = 74g (0.9 * 82 = 73.8 ≈ 74)", () => {
    expect(macros.fatG).toBe(74);
  });

  test("carbs = 318g (remaining kcal / 4)", () => {
    // (2627 - 172*4 - 74*9) / 4 = (2627 - 688 - 666) / 4 = 1273 / 4 = 318.25 ≈ 318
    expect(macros.carbG).toBe(318);
  });

  test("total kcal = 2626 (P*4 + F*9 + C*4)", () => {
    // 172*4 + 74*9 + 318*4 = 688 + 666 + 1272 = 2626
    expect(macros.totalKcal).toBe(2626);
  });
});

describe("Marco Bellini — Macros (Rest)", () => {
  const bf = estimateBodyFat(marco);
  const macros = calculateMacros(2372, bf.bodyComposition, 82, "rest");

  test("protein = 152g (2.2 * 68.88 = 151.536 ≈ 152)", () => {
    expect(macros.proteinG).toBe(152);
  });

  test("fat = 82g (1.0 * 82 = 82)", () => {
    expect(macros.fatG).toBe(82);
  });

  test("carbs = 257g", () => {
    // (2372 - 152*4 - 82*9) / 4 = (2372 - 608 - 738) / 4 = 1026 / 4 = 256.5 ≈ 257
    expect(macros.carbG).toBe(257);
  });

  test("total kcal = 2374", () => {
    // 152*4 + 82*9 + 257*4 = 608 + 738 + 1028 = 2374
    expect(macros.totalKcal).toBe(2374);
  });
});

// ── Hydration ───────────────────────────────────────────────────────────────

describe("Marco Bellini — Hydration", () => {
  test("training: 3575ml water, 6.5g salt", () => {
    const h = calculateHydration(82, "training");
    // base: 37.5 * 82 = 3075, + 500 training bonus = 3575
    expect(h.waterMl).toBe(3575);
    expect(h.saltG).toBe(6.5);
  });

  test("rest: 3075ml water, 5g salt", () => {
    const h = calculateHydration(82, "rest");
    // 37.5 * 82 = 3075
    expect(h.waterMl).toBe(3075);
    expect(h.saltG).toBe(5);
  });
});

// ── Full Plan Integration ───────────────────────────────────────────────────

describe("Marco Bellini — Full Plan", () => {
  test("daily plan training matches all intermediates", () => {
    const plan = generateDailyPlan(marco, "training");
    expect(plan.dayType).toBe("training");
    expect(plan.tdee.totalTdeeKcal).toBe(2627);
    expect(plan.macros.proteinG).toBe(172);
    expect(plan.macros.fatG).toBe(74);
    expect(plan.macros.carbG).toBe(318);
    expect(plan.hydration.waterMl).toBe(3575);
  });

  test("daily plan rest matches all intermediates", () => {
    const plan = generateDailyPlan(marco, "rest");
    expect(plan.dayType).toBe("rest");
    expect(plan.tdee.totalTdeeKcal).toBe(2372);
    expect(plan.macros.proteinG).toBe(152);
    expect(plan.macros.fatG).toBe(82);
    expect(plan.macros.carbG).toBe(257);
    expect(plan.hydration.waterMl).toBe(3075);
  });

  test("weekly plan respects T/R/T/R/T/R/R schedule", () => {
    const weekly = generateWeeklyPlan(marco);
    expect(weekly.days).toHaveLength(7);
    expect(weekly.days[0].dayType).toBe("training");
    expect(weekly.days[1].dayType).toBe("rest");
    expect(weekly.days[2].dayType).toBe("training");
    expect(weekly.days[3].dayType).toBe("rest");
    expect(weekly.days[4].dayType).toBe("training");
    expect(weekly.days[5].dayType).toBe("rest");
    expect(weekly.days[6].dayType).toBe("rest");
  });

  test("weekly averages computed correctly", () => {
    const weekly = generateWeeklyPlan(marco);
    // 3 training days × 2626 + 4 rest days × 2374 = 7878 + 9496 = 17374 / 7 = 2482
    const expectedAvgKcal = Math.round((3 * 2626 + 4 * 2374) / 7);
    expect(weekly.weeklyAverageKcal).toBe(expectedAvgKcal);

    // 3 training × 172 + 4 rest × 152 = 516 + 608 = 1124 / 7 = 160.57... ≈ 161
    const expectedAvgProtein = Math.round((3 * 172 + 4 * 152) / 7);
    expect(weekly.weeklyAverageProteinG).toBe(expectedAvgProtein);
  });
});

// ── May Features Fidelity Pins ──────────────────────────────────────────────

describe("Marco Bellini — Goal Rate", () => {
  test("78kg target in 12 weeks pins rate and safety floor", () => {
    const goalRate = computeGoalRate({
      currentKg: marco.weightKg,
      targetKg: 78,
      weeks: 12,
      tdeeKcal: 2481,
      leanMassKg: estimateBodyFat(marco).bodyComposition.leanMassKg,
    });

    // (pinned from engine @ HEAD 2026-07-20)
    expect({
      requiredKgPerWeek: goalRate.requiredKgPerWeek,
      dailyDeficitKcal: goalRate.dailyDeficitKcal,
      band: goalRate.band,
      kcalFloor: goalRate.kcalFloor,
      withinSafetyFloor: !goalRate.belowFloor,
    }).toEqual({
      requiredKgPerWeek: 0.33,
      dailyDeficitKcal: 367,
      band: "comfortable",
      kcalFloor: 1515,
      withinSafetyFloor: true,
    });
  });
});

describe("Marco Bellini — Absolute Macro Overrides", () => {
  test("protein fixed at 180g pins the full macro line per day type", () => {
    const bodyComposition = estimateBodyFat(marco).bodyComposition;
    const macroOptions = {
      absoluteOverrides: {
        training: { proteinG: 180 },
        rest: { proteinG: 180 },
      },
    };

    // (pinned from engine @ HEAD 2026-07-20)
    expect([
      calculateMacros(2627, bodyComposition, marco.weightKg, "training", macroOptions),
      calculateMacros(2372, bodyComposition, marco.weightKg, "rest", macroOptions),
    ]).toEqual([
      { proteinG: 180, fatG: 74, carbG: 310, totalKcal: 2626, dayType: "training" },
      { proteinG: 180, fatG: 82, carbG: 229, totalKcal: 2374, dayType: "rest" },
    ]);
  });
});
