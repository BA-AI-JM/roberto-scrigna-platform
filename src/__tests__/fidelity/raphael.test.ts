/**
 * Fidelity test: Raphael.
 *
 * Strength athlete with 3 distinct day types using TDEE overrides:
 * - OFF (rest):       TDEE = 2300
 * - ON1 (training):   TDEE = 2650
 * - ON2 (training):   TDEE = 3200
 *
 * Male, 35y, 90kg, 183cm, BF% override 18%, 7000 steps/day, sedentary.
 */

import {
  estimateBodyFat,
  calculateBmr,
  calculateNeat,
  calculateTdee,
  calculateMacros,
  calculateHydration,
  type ClientSnapshot,
} from "../../engine/index";

// ── Fixture ─────────────────────────────────────────────────────────────────

const raphael: ClientSnapshot = {
  sex: "male",
  ageYears: 35,
  weightKg: 90,
  heightCm: 183,
  bodyFatPctOverride: 18,
  dailySteps: 7000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

// ── Body Composition ────────────────────────────────────────────────────────

describe("Raphael — Body Composition", () => {
  test("BF% = 18%", () => {
    const bf = estimateBodyFat(raphael);
    expect(bf.method).toBe("override");
    expect(bf.bodyComposition.bodyFatPct).toBe(18);
  });

  test("lean mass = 73.8 kg (90 * 0.82)", () => {
    const bf = estimateBodyFat(raphael);
    expect(bf.bodyComposition.leanMassKg).toBe(73.8);
  });

  test("fat mass = 16.2 kg (90 * 0.18)", () => {
    const bf = estimateBodyFat(raphael);
    expect(bf.bodyComposition.fatMassKg).toBe(16.2);
  });

  test("lean + fat = total weight", () => {
    const bf = estimateBodyFat(raphael);
    const total = bf.bodyComposition.leanMassKg + bf.bodyComposition.fatMassKg;
    expect(total).toBeCloseTo(90, 1);
  });
});

// ── BMR ─────────────────────────────────────────────────────────────────────

describe("Raphael — BMR", () => {
  test("BMR = 1964 kcal (370 + 21.6 * 73.8)", () => {
    const bf = estimateBodyFat(raphael);
    const bmr = calculateBmr(bf);
    // 370 + 21.6 * 73.8 = 370 + 1594.08 = 1964.08 ≈ 1964
    expect(bmr.bmrKcal).toBe(1964);
  });
});

// ── NEAT ────────────────────────────────────────────────────────────────────

describe("Raphael — NEAT", () => {
  test("steps kcal = 315 (7000 * 0.0005 * 90)", () => {
    const neat = calculateNeat(7000, 90, "sedentary");
    expect(neat.stepsKcal).toBe(315);
  });

  test("occupational kcal = 0 (sedentary)", () => {
    const neat = calculateNeat(7000, 90, "sedentary");
    expect(neat.occupationalKcal).toBe(0);
  });

  test("total NEAT = 315", () => {
    const neat = calculateNeat(7000, 90, "sedentary");
    expect(neat.totalNeatKcal).toBe(315);
  });
});

// ── TDEE per Day Type (via overrides) ───────────────────────────────────────

describe("Raphael — TDEE OFF=2300", () => {
  test("OFF day TDEE = 2300 via override", () => {
    const tdee = calculateTdee(raphael, "rest", {
      overrides: [{ dayType: "rest", tdeeKcal: 2300 }],
    });
    expect(tdee.totalTdeeKcal).toBe(2300);
    expect(tdee.dayType).toBe("rest");
  });

  test("macros: P=148g F=90g C=225g total=2302", () => {
    const bf = estimateBodyFat(raphael);
    const macros = calculateMacros(2300, bf.bodyComposition, 90, "rest");
    expect(macros.proteinG).toBe(148);
    expect(macros.fatG).toBe(90);
    expect(macros.carbG).toBe(225);
    expect(macros.totalKcal).toBe(2302);
  });
});

describe("Raphael — TDEE ON1=2650", () => {
  test("ON1 day TDEE = 2650 via override", () => {
    const tdee = calculateTdee(raphael, "training", {
      overrides: [{ dayType: "training", tdeeKcal: 2650 }],
    });
    expect(tdee.totalTdeeKcal).toBe(2650);
    expect(tdee.dayType).toBe("training");
  });

  test("macros: P=162g F=81g C=318g total=2649", () => {
    const bf = estimateBodyFat(raphael);
    const macros = calculateMacros(2650, bf.bodyComposition, 90, "training");
    expect(macros.proteinG).toBe(162);
    expect(macros.fatG).toBe(81);
    expect(macros.carbG).toBe(318);
    expect(macros.totalKcal).toBe(2649);
  });
});

describe("Raphael — TDEE ON2=3200", () => {
  test("ON2 day TDEE = 3200 via override", () => {
    const tdee = calculateTdee(raphael, "training", {
      overrides: [{ dayType: "training", tdeeKcal: 3200 }],
    });
    expect(tdee.totalTdeeKcal).toBe(3200);
    expect(tdee.dayType).toBe("training");
  });

  test("macros: P=162g F=81g C=456g total=3201", () => {
    const bf = estimateBodyFat(raphael);
    const macros = calculateMacros(3200, bf.bodyComposition, 90, "training");
    expect(macros.proteinG).toBe(162);
    expect(macros.fatG).toBe(81);
    expect(macros.carbG).toBe(456);
    expect(macros.totalKcal).toBe(3201);
  });
});

// ── Hydration ───────────────────────────────────────────────────────────────

describe("Raphael — Hydration", () => {
  test("training: 3650ml water, 6.5g salt", () => {
    const h = calculateHydration(90, "training");
    expect(h.waterMl).toBe(3650);
    expect(h.saltG).toBe(6.5);
  });

  test("rest: 3150ml water, 5g salt", () => {
    const h = calculateHydration(90, "rest");
    expect(h.waterMl).toBe(3150);
    expect(h.saltG).toBe(5);
  });
});

// ── Cross-Day Validation ────────────────────────────────────────────────────

describe("Raphael — Cross-Day Validation", () => {
  const bf = estimateBodyFat(raphael);

  test("protein constant across training days (162g)", () => {
    const on1 = calculateMacros(2650, bf.bodyComposition, 90, "training");
    const on2 = calculateMacros(3200, bf.bodyComposition, 90, "training");
    expect(on1.proteinG).toBe(162);
    expect(on2.proteinG).toBe(162);
  });

  test("fat constant across training days (81g)", () => {
    const on1 = calculateMacros(2650, bf.bodyComposition, 90, "training");
    const on2 = calculateMacros(3200, bf.bodyComposition, 90, "training");
    expect(on1.fatG).toBe(81);
    expect(on2.fatG).toBe(81);
  });

  test("carbs scale with TDEE", () => {
    const off = calculateMacros(2300, bf.bodyComposition, 90, "rest");
    const on1 = calculateMacros(2650, bf.bodyComposition, 90, "training");
    const on2 = calculateMacros(3200, bf.bodyComposition, 90, "training");
    expect(on1.carbG).toBeGreaterThan(off.carbG);
    expect(on2.carbG).toBeGreaterThan(on1.carbG);
  });

  test("rest day has different macro profile than training", () => {
    const off = calculateMacros(2300, bf.bodyComposition, 90, "rest");
    const on1 = calculateMacros(2650, bf.bodyComposition, 90, "training");
    // Rest: lower protein/kg, higher fat/kg
    expect(off.proteinG).toBeLessThan(on1.proteinG);
    expect(off.fatG).toBeGreaterThan(on1.fatG);
  });
});
