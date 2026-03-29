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
  test("training day TEF = 244 kcal (10% of BMR+NEAT+exercise = 1858+328+255 = 2441)", () => {
    const tdee = calculateTdee(marco, "training");
    expect(tdee.tef.tefPct).toBe(10);
    expect(tdee.tef.tefKcal).toBe(244);
  });

  test("rest day TEF = 219 kcal (10% of 1858+328+0 = 2186)", () => {
    const tdee = calculateTdee(marco, "rest");
    expect(tdee.tef.tefPct).toBe(10);
    expect(tdee.tef.tefKcal).toBe(219);
  });
});

// ── TDEE ────────────────────────────────────────────────────────────────────

describe("Marco Bellini — TDEE", () => {
  test("training TDEE = 2685 kcal", () => {
    const tdee = calculateTdee(marco, "training");
    expect(tdee.totalTdeeKcal).toBe(2685);
  });

  test("rest TDEE = 2405 kcal", () => {
    const tdee = calculateTdee(marco, "rest");
    expect(tdee.totalTdeeKcal).toBe(2405);
  });

  test("training TDEE = BMR + NEAT + exercise + TEF", () => {
    const tdee = calculateTdee(marco, "training");
    const sum = tdee.bmr.bmrKcal + tdee.neat.totalNeatKcal + tdee.exercise.exerciseKcal + tdee.tef.tefKcal;
    expect(sum).toBe(1858 + 328 + 255 + 244);
    expect(tdee.totalTdeeKcal).toBe(sum);
  });

  test("rest TDEE = BMR + NEAT + 0 + TEF", () => {
    const tdee = calculateTdee(marco, "rest");
    const sum = tdee.bmr.bmrKcal + tdee.neat.totalNeatKcal + tdee.exercise.exerciseKcal + tdee.tef.tefKcal;
    expect(sum).toBe(1858 + 328 + 0 + 219);
    expect(tdee.totalTdeeKcal).toBe(sum);
  });
});

// ── Macros ──────────────────────────────────────────────────────────────────

describe("Marco Bellini — Macros (Training)", () => {
  const bf = estimateBodyFat(marco);
  const macros = calculateMacros(2685, bf.bodyComposition, 82, "training");

  test("protein = 152g (2.2 * 68.88 = 151.54 ≈ 152)", () => {
    expect(macros.proteinG).toBe(152);
  });

  test("fat = 74g (0.9 * 82 = 73.8 ≈ 74)", () => {
    expect(macros.fatG).toBe(74);
  });

  test("carbs = 353g (remaining kcal / 4)", () => {
    // (2685 - 152*4 - 74*9) / 4 = (2685 - 608 - 666) / 4 = 1411 / 4 = 352.75 ≈ 353
    expect(macros.carbG).toBe(353);
  });

  test("total kcal = 2686 (P*4 + F*9 + C*4)", () => {
    expect(macros.totalKcal).toBe(2686);
  });
});

describe("Marco Bellini — Macros (Rest)", () => {
  const bf = estimateBodyFat(marco);
  const macros = calculateMacros(2405, bf.bodyComposition, 82, "rest");

  test("protein = 138g (2.0 * 68.88 = 137.76 ≈ 138)", () => {
    expect(macros.proteinG).toBe(138);
  });

  test("fat = 82g (1.0 * 82 = 82)", () => {
    expect(macros.fatG).toBe(82);
  });

  test("carbs = 279g", () => {
    // (2405 - 138*4 - 82*9) / 4 = (2405 - 552 - 738) / 4 = 1115 / 4 = 278.75 ≈ 279
    expect(macros.carbG).toBe(279);
  });

  test("total kcal = 2406", () => {
    expect(macros.totalKcal).toBe(2406);
  });
});

// ── Hydration ───────────────────────────────────────────────────────────────

describe("Marco Bellini — Hydration", () => {
  test("training: 3370ml water, 6.5g salt", () => {
    const h = calculateHydration(82, "training");
    expect(h.waterMl).toBe(3370);
    expect(h.saltG).toBe(6.5);
  });

  test("rest: 2870ml water, 5g salt", () => {
    const h = calculateHydration(82, "rest");
    expect(h.waterMl).toBe(2870);
    expect(h.saltG).toBe(5);
  });
});

// ── Full Plan Integration ───────────────────────────────────────────────────

describe("Marco Bellini — Full Plan", () => {
  test("daily plan training matches all intermediates", () => {
    const plan = generateDailyPlan(marco, "training");
    expect(plan.dayType).toBe("training");
    expect(plan.tdee.totalTdeeKcal).toBe(2685);
    expect(plan.macros.proteinG).toBe(152);
    expect(plan.macros.fatG).toBe(74);
    expect(plan.macros.carbG).toBe(353);
    expect(plan.hydration.waterMl).toBe(3370);
  });

  test("daily plan rest matches all intermediates", () => {
    const plan = generateDailyPlan(marco, "rest");
    expect(plan.dayType).toBe("rest");
    expect(plan.tdee.totalTdeeKcal).toBe(2405);
    expect(plan.macros.proteinG).toBe(138);
    expect(plan.macros.fatG).toBe(82);
    expect(plan.macros.carbG).toBe(279);
    expect(plan.hydration.waterMl).toBe(2870);
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
    // 3 training days × 2686 + 4 rest days × 2406 = 8058 + 9624 = 17682 / 7 = 2526
    const expectedAvgKcal = Math.round((3 * 2686 + 4 * 2406) / 7);
    expect(weekly.weeklyAverageKcal).toBe(expectedAvgKcal);

    // 3 training × 152 + 4 rest × 138 = 456 + 552 = 1008 / 7 = 144
    const expectedAvgProtein = Math.round((3 * 152 + 4 * 138) / 7);
    expect(weekly.weeklyAverageProteinG).toBe(expectedAvgProtein);
  });
});
