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

  test("macros: P=142g F=75g C=289g total=2399", () => {
    // P: 2.2 * 64.5 = 141.9 ≈ 142g
    // F: 1.0 * 75 = 75g
    // C: (2400 - 142*4 - 75*9) / 4 = (2400 - 568 - 675) / 4 = 1157 / 4 = 289.25 ≈ 289g
    // total: 142*4 + 75*9 + 289*4 = 568 + 675 + 1156 = 2399
    const bf = estimateBodyFat(niccolo);
    const macros = calculateMacros(2400, bf.bodyComposition, 75, "rest");
    expect(macros.proteinG).toBe(142);
    expect(macros.fatG).toBe(75);
    expect(macros.carbG).toBe(289);
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

  test("macros: P=161g F=68g C=336g total=2600", () => {
    // P: 2.5 * 64.5 = 161.25 ≈ 161g
    // F: 0.9 * 75 = 67.5 ≈ 68g
    // C: (2600 - 161*4 - 68*9) / 4 = (2600 - 644 - 612) / 4 = 1344 / 4 = 336g
    // total: 161*4 + 68*9 + 336*4 = 644 + 612 + 1344 = 2600
    const bf = estimateBodyFat(niccolo);
    const macros = calculateMacros(2600, bf.bodyComposition, 75, "training");
    expect(macros.proteinG).toBe(161);
    expect(macros.fatG).toBe(68);
    expect(macros.carbG).toBe(336);
    expect(macros.totalKcal).toBe(2600);
  });
});

describe("Niccolo — TDEE BIKE=2750", () => {
  test("BIKE day: macros at 2750 kcal training profile", () => {
    // P=161g, F=68g, C=(2750-644-612)/4=1494/4=373.5→374g
    // total: 644+612+374*4=644+612+1496=2752
    const bf = estimateBodyFat(niccolo);
    const macros = calculateMacros(2750, bf.bodyComposition, 75, "training");
    expect(macros.proteinG).toBe(161);
    expect(macros.fatG).toBe(68);
    expect(macros.carbG).toBe(374);
    expect(macros.totalKcal).toBe(2752);
  });
});

describe("Niccolo — TDEE LONG_RUN=3700", () => {
  test("LONG_RUN day: macros at 3700 kcal training profile", () => {
    // P=161g, F=68g, C=(3700-644-612)/4=2444/4=611g
    // total: 644+612+611*4=644+612+2444=3700
    const bf = estimateBodyFat(niccolo);
    const macros = calculateMacros(3700, bf.bodyComposition, 75, "training");
    expect(macros.proteinG).toBe(161);
    expect(macros.fatG).toBe(68);
    expect(macros.carbG).toBe(611);
    expect(macros.totalKcal).toBe(3700);
  });
});

// ── Hydration ───────────────────────────────────────────────────────────────

describe("Niccolo — Hydration", () => {
  test("training: 3313ml water, 6.5g salt", () => {
    // base: 37.5 * 75 = 2812.5 → Math.round = 2813, + 500 = 3313
    const h = calculateHydration(75, "training");
    expect(h.waterMl).toBe(3313);
    expect(h.saltG).toBe(6.5);
  });

  test("rest: 2813ml water, 5g salt", () => {
    // 37.5 * 75 = 2812.5 → Math.round = 2813
    const h = calculateHydration(75, "rest");
    expect(h.waterMl).toBe(2813);
    expect(h.saltG).toBe(5);
  });
});

// ── Cross-Day-Type Macro Comparison ─────────────────────────────────────────

describe("Niccolo — Cross-Day Validation", () => {
  const bf = estimateBodyFat(niccolo);

  test("protein constant across training days (161g)", () => {
    const rt = calculateMacros(2600, bf.bodyComposition, 75, "training");
    const bike = calculateMacros(2750, bf.bodyComposition, 75, "training");
    const lr = calculateMacros(3700, bf.bodyComposition, 75, "training");
    expect(rt.proteinG).toBe(161);
    expect(bike.proteinG).toBe(161);
    expect(lr.proteinG).toBe(161);
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
