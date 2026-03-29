/**
 * Fidelity test: Niccolo.
 *
 * Endurance athlete with 4 distinct day types using TDEE overrides:
 * - OFF (rest):      TDEE = 2400
 * - RT (training):   TDEE = 2600
 * - BIKE (training): TDEE = 2750
 * - LONG_RUN (training): TDEE = 3700
 *
 * Male, 28y, 75kg, 180cm, BF% override 14%, 10000 steps/day, light occupation.
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

const niccolo: ClientSnapshot = {
  sex: "male",
  ageYears: 28,
  weightKg: 75,
  heightCm: 180,
  bodyFatPctOverride: 14,
  dailySteps: 10000,
  occupationalLevel: "light",
  weekSchedule: ["training", "training", "rest", "training", "rest", "training", "rest"],
};

/** TDEE overrides representing Niccolo's distinct activity days */
const tdeeOverrides = [
  { dayType: "rest" as const, tdeeKcal: 2400 },
  { dayType: "training" as const, tdeeKcal: 2600 },
];

// ── Body Composition ────────────────────────────────────────────────────────

describe("Niccolo — Body Composition", () => {
  test("BF% = 14%", () => {
    const bf = estimateBodyFat(niccolo);
    expect(bf.method).toBe("override");
    expect(bf.bodyComposition.bodyFatPct).toBe(14);
  });

  test("lean mass = 64.5 kg", () => {
    const bf = estimateBodyFat(niccolo);
    expect(bf.bodyComposition.leanMassKg).toBe(64.5);
  });

  test("fat mass = 10.5 kg", () => {
    const bf = estimateBodyFat(niccolo);
    expect(bf.bodyComposition.fatMassKg).toBe(10.5);
  });
});

// ── BMR ─────────────────────────────────────────────────────────────────────

describe("Niccolo — BMR", () => {
  test("BMR = 1763 kcal (370 + 21.6 * 64.5)", () => {
    const bf = estimateBodyFat(niccolo);
    const bmr = calculateBmr(bf);
    // 370 + 21.6 * 64.5 = 370 + 1393.2 = 1763.2 ≈ 1763
    expect(bmr.bmrKcal).toBe(1763);
  });
});

// ── NEAT ────────────────────────────────────────────────────────────────────

describe("Niccolo — NEAT", () => {
  test("steps kcal = 375 (10000 * 0.0005 * 75)", () => {
    const neat = calculateNeat(10000, 75, "light");
    expect(neat.stepsKcal).toBe(375);
  });

  test("occupational kcal = 200 (light)", () => {
    const neat = calculateNeat(10000, 75, "light");
    expect(neat.occupationalKcal).toBe(200);
  });

  test("total NEAT = 575", () => {
    const neat = calculateNeat(10000, 75, "light");
    expect(neat.totalNeatKcal).toBe(575);
  });
});

// ── TDEE per Day Type (via overrides) ───────────────────────────────────────

describe("Niccolo — TDEE OFF=2400", () => {
  test("OFF day TDEE = 2400 via override", () => {
    const tdee = calculateTdee(niccolo, "rest", { overrides: tdeeOverrides });
    expect(tdee.totalTdeeKcal).toBe(2400);
    expect(tdee.dayType).toBe("rest");
  });

  test("macros: P=129g F=75g C=302g total=2399", () => {
    const bf = estimateBodyFat(niccolo);
    const macros = calculateMacros(2400, bf.bodyComposition, 75, "rest");
    expect(macros.proteinG).toBe(129);
    expect(macros.fatG).toBe(75);
    expect(macros.carbG).toBe(302);
    expect(macros.totalKcal).toBe(2399);
  });
});

describe("Niccolo — TDEE RT=2600", () => {
  test("RT day TDEE = 2600 via override", () => {
    const tdee = calculateTdee(niccolo, "training", {
      overrides: [{ dayType: "training", tdeeKcal: 2600 }],
    });
    expect(tdee.totalTdeeKcal).toBe(2600);
    expect(tdee.dayType).toBe("training");
  });

  test("macros: P=142g F=68g C=355g total=2600", () => {
    const bf = estimateBodyFat(niccolo);
    const macros = calculateMacros(2600, bf.bodyComposition, 75, "training");
    expect(macros.proteinG).toBe(142);
    expect(macros.fatG).toBe(68);
    expect(macros.carbG).toBe(355);
    expect(macros.totalKcal).toBe(2600);
  });
});

describe("Niccolo — TDEE BIKE=2750", () => {
  test("BIKE day: macros at 2750 kcal training profile", () => {
    const bf = estimateBodyFat(niccolo);
    const macros = calculateMacros(2750, bf.bodyComposition, 75, "training");
    expect(macros.proteinG).toBe(142);
    expect(macros.fatG).toBe(68);
    expect(macros.carbG).toBe(393);
    expect(macros.totalKcal).toBe(2752);
  });
});

describe("Niccolo — TDEE LONG_RUN=3700", () => {
  test("LONG_RUN day: macros at 3700 kcal training profile", () => {
    const bf = estimateBodyFat(niccolo);
    const macros = calculateMacros(3700, bf.bodyComposition, 75, "training");
    expect(macros.proteinG).toBe(142);
    expect(macros.fatG).toBe(68);
    expect(macros.carbG).toBe(630);
    expect(macros.totalKcal).toBe(3700);
  });
});

// ── Hydration ───────────────────────────────────────────────────────────────

describe("Niccolo — Hydration", () => {
  test("training: 3125ml water, 6.5g salt", () => {
    const h = calculateHydration(75, "training");
    expect(h.waterMl).toBe(3125);
    expect(h.saltG).toBe(6.5);
  });

  test("rest: 2625ml water, 5g salt", () => {
    const h = calculateHydration(75, "rest");
    expect(h.waterMl).toBe(2625);
    expect(h.saltG).toBe(5);
  });
});

// ── Cross-Day-Type Macro Comparison ─────────────────────────────────────────

describe("Niccolo — Cross-Day Validation", () => {
  const bf = estimateBodyFat(niccolo);

  test("protein constant across training days (142g)", () => {
    const rt = calculateMacros(2600, bf.bodyComposition, 75, "training");
    const bike = calculateMacros(2750, bf.bodyComposition, 75, "training");
    const lr = calculateMacros(3700, bf.bodyComposition, 75, "training");
    expect(rt.proteinG).toBe(142);
    expect(bike.proteinG).toBe(142);
    expect(lr.proteinG).toBe(142);
  });

  test("fat constant across training days (68g)", () => {
    const rt = calculateMacros(2600, bf.bodyComposition, 75, "training");
    const bike = calculateMacros(2750, bf.bodyComposition, 75, "training");
    const lr = calculateMacros(3700, bf.bodyComposition, 75, "training");
    expect(rt.fatG).toBe(68);
    expect(bike.fatG).toBe(68);
    expect(lr.fatG).toBe(68);
  });

  test("carbs scale with TDEE (higher TDEE = more carbs)", () => {
    const rt = calculateMacros(2600, bf.bodyComposition, 75, "training");
    const bike = calculateMacros(2750, bf.bodyComposition, 75, "training");
    const lr = calculateMacros(3700, bf.bodyComposition, 75, "training");
    expect(bike.carbG).toBeGreaterThan(rt.carbG);
    expect(lr.carbG).toBeGreaterThan(bike.carbG);
  });
});
