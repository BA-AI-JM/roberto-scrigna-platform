import {
  estimateBodyFat,
  calculateBmr,
  calculateNeat,
  calculateTef,
  calculateExercise,
  restDayExercise,
  calculateTdee,
  calculateWeeklyTdee,
  calculateMacros,
  calculateHydration,
  generateDailyPlan,
  generateWeeklyPlan,
  type ClientSnapshot,
  type ExerciseSession,
} from "../index";

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const maleClient: ClientSnapshot = {
  sex: "male",
  ageYears: 30,
  weightKg: 85,
  heightCm: 180,
  dailySteps: 10000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

const femaleClient: ClientSnapshot = {
  sex: "female",
  ageYears: 28,
  weightKg: 65,
  heightCm: 165,
  dailySteps: 8000,
  occupationalLevel: "light",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "refeed"],
};

const clientWith7Site: ClientSnapshot = {
  ...maleClient,
  skinfold7: {
    chest: 10,
    midaxillary: 12,
    tricep: 11,
    subscapular: 14,
    abdominal: 20,
    suprailiac: 15,
    thigh: 16,
  },
};

const clientWith3SiteMale: ClientSnapshot = {
  ...maleClient,
  skinfold3: {
    chest: 10,
    abdominal: 20,
    thigh: 16,
  },
};

const clientWithOverride: ClientSnapshot = {
  ...maleClient,
  bodyFatPctOverride: 15,
};

// ── Body Fat Tests ────────────────────────────────────────────────────────────

describe("Body Fat Estimation", () => {
  test("7-site J&P for male", () => {
    const result = estimateBodyFat(clientWith7Site);
    expect(result.method).toBe("7site");
    expect(result.bodyComposition.bodyFatPct).toBeGreaterThan(5);
    expect(result.bodyComposition.bodyFatPct).toBeLessThan(30);
    expect(result.bodyComposition.leanMassKg).toBeGreaterThan(0);
    expect(result.bodyComposition.fatMassKg).toBeGreaterThan(0);
    // Lean + fat should equal total weight
    const total =
      result.bodyComposition.leanMassKg + result.bodyComposition.fatMassKg;
    expect(Math.abs(total - 85)).toBeLessThan(0.1);
  });

  test("3-site J&P for male", () => {
    const result = estimateBodyFat(clientWith3SiteMale);
    expect(result.method).toBe("3site");
    expect(result.bodyComposition.bodyFatPct).toBeGreaterThan(5);
    expect(result.bodyComposition.bodyFatPct).toBeLessThan(30);
  });

  test("manual override takes priority", () => {
    const result = estimateBodyFat(clientWithOverride);
    expect(result.method).toBe("override");
    expect(result.bodyComposition.bodyFatPct).toBe(15);
    expect(result.bodyComposition.fatMassKg).toBeCloseTo(12.75, 1);
    expect(result.bodyComposition.leanMassKg).toBeCloseTo(72.25, 1);
  });

  test("heuristic fallback when no skinfold data", () => {
    const result = estimateBodyFat(maleClient);
    expect(result.method).toBe("heuristic");
    expect(result.bodyComposition.bodyFatPct).toBeGreaterThan(5);
    expect(result.bodyComposition.bodyFatPct).toBeLessThan(40);
  });

  test("female heuristic", () => {
    const result = estimateBodyFat(femaleClient);
    expect(result.method).toBe("heuristic");
    expect(result.bodyComposition.bodyFatPct).toBeGreaterThan(10);
    expect(result.bodyComposition.bodyFatPct).toBeLessThan(45);
  });
});

// ── BMR Tests ─────────────────────────────────────────────────────────────────

describe("BMR (Katch-McArdle)", () => {
  test("calculates BMR from body fat result", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const bmr = calculateBmr(bodyFat);
    // 370 + 21.6 * 72.25 = 370 + 1560.6 = 1930.6 ≈ 1931
    expect(bmr.bmrKcal).toBeCloseTo(1931, 0);
  });

  test("BMR scales with lean mass", () => {
    const light = estimateBodyFat({ ...clientWithOverride, bodyFatPctOverride: 25 });
    const lean = estimateBodyFat({ ...clientWithOverride, bodyFatPctOverride: 10 });
    const bmrLight = calculateBmr(light);
    const bmrLean = calculateBmr(lean);
    expect(bmrLean.bmrKcal).toBeGreaterThan(bmrLight.bmrKcal);
  });
});

// ── NEAT Tests ────────────────────────────────────────────────────────────────

describe("NEAT", () => {
  test("sedentary with 10k steps", () => {
    const neat = calculateNeat(10000, 85, "sedentary");
    expect(neat.stepsKcal).toBeGreaterThan(0);
    expect(neat.occupationalKcal).toBe(0);
    expect(neat.totalNeatKcal).toBe(neat.stepsKcal);
  });

  test("light occupation adds kcal", () => {
    const neat = calculateNeat(10000, 85, "light");
    expect(neat.occupationalKcal).toBe(200);
    expect(neat.totalNeatKcal).toBe(neat.stepsKcal + 200);
  });

  test("more steps = more NEAT", () => {
    const low = calculateNeat(5000, 85, "sedentary");
    const high = calculateNeat(15000, 85, "sedentary");
    expect(high.stepsKcal).toBeGreaterThan(low.stepsKcal);
  });

  test("heavier person burns more per step", () => {
    const light = calculateNeat(10000, 60, "sedentary");
    const heavy = calculateNeat(10000, 100, "sedentary");
    expect(heavy.stepsKcal).toBeGreaterThan(light.stepsKcal);
  });
});

// ── TEF Tests ─────────────────────────────────────────────────────────────────

describe("TEF", () => {
  test("default 10% of subtotal", () => {
    const tef = calculateTef(2000);
    expect(tef.tefPct).toBe(10);
    expect(tef.tefKcal).toBe(200);
  });

  test("high protein diet = 15%", () => {
    const tef = calculateTef(2000, "high_protein");
    expect(tef.tefPct).toBe(15);
    expect(tef.tefKcal).toBe(300);
  });

  test("high fat diet = 8%", () => {
    const tef = calculateTef(2000, "high_fat");
    expect(tef.tefPct).toBe(8);
    expect(tef.tefKcal).toBe(160);
  });
});

// ── Exercise Tests ────────────────────────────────────────────────────────────

describe("Exercise", () => {
  const ctx = { weightKg: 85, ageYears: 30, sex: "male" as const };

  test("HR-based method", () => {
    const session: ExerciseSession = {
      method: "heart_rate",
      durationMin: 60,
      avgHeartRate: 145,
    };
    const result = calculateExercise(session, ctx);
    expect(result.methodUsed).toBe("heart_rate");
    expect(result.exerciseKcal).toBeGreaterThan(0);
    expect(result.recalibrationFactor).toBe(0.85);
  });

  test("MET-based method", () => {
    const session: ExerciseSession = {
      method: "met_value",
      durationMin: 60,
      metValue: 6,
    };
    const result = calculateExercise(session, ctx);
    expect(result.methodUsed).toBe("met_value");
    // No-HR RPE-MET path skips 0.85: 6 * 85 * 1 = 510
    expect(result.exerciseKcal).toBeCloseTo(510, 0);
    expect(result.recalibrationFactor).toBe(1);
  });

  test("session estimate method", () => {
    const session: ExerciseSession = {
      method: "session_estimate",
      durationMin: 60,
      kcalEstimate: 400,
    };
    const result = calculateExercise(session, ctx);
    expect(result.methodUsed).toBe("session_estimate");
    expect(result.exerciseKcal).toBe(340); // 400 * 0.85
  });

  test("default fallback", () => {
    const session: ExerciseSession = {
      method: "default_estimate",
      durationMin: 60,
    };
    const result = calculateExercise(session, ctx);
    expect(result.methodUsed).toBe("default_estimate");
    expect(result.exerciseKcal).toBe(255); // 300 * 0.85
  });

  test("v4.4.1 recalibration applied", () => {
    const session: ExerciseSession = {
      method: "session_estimate",
      durationMin: 60,
      kcalEstimate: 1000,
    };
    const result = calculateExercise(session, ctx);
    expect(result.exerciseKcal).toBe(850); // 1000 * 0.85
  });

  test("rest day exercise is zero", () => {
    const result = restDayExercise();
    expect(result.exerciseKcal).toBe(0);
  });

  test("HR fallback to MET when no HR data", () => {
    const session: ExerciseSession = {
      method: "heart_rate",
      durationMin: 60,
      metValue: 6,
      // no avgHeartRate
    };
    const result = calculateExercise(session, ctx);
    expect(result.methodUsed).toBe("met_value");
  });
});

// ── TDEE Tests ────────────────────────────────────────────────────────────────

describe("TDEE", () => {
  test("training day > rest day", () => {
    const training = calculateTdee(clientWithOverride, "training");
    const rest = calculateTdee(clientWithOverride, "rest");
    expect(training.totalTdeeKcal).toBeGreaterThan(rest.totalTdeeKcal);
  });

  test("TDEE components sum correctly", () => {
    const result = calculateTdee(clientWithOverride, "rest");
    const expected =
      result.bmr.bmrKcal +
      result.neat.totalNeatKcal +
      result.exercise.exerciseKcal +
      result.tef.tefKcal;
    expect(result.totalTdeeKcal).toBe(expected);
  });

  test("manual override replaces total TDEE", () => {
    const result = calculateTdee(clientWithOverride, "training", {
      overrides: [{ dayType: "training", tdeeKcal: 3000 }],
    });
    expect(result.totalTdeeKcal).toBe(3000);
  });

  test("weekly TDEE returns 7 results", () => {
    const weekly = calculateWeeklyTdee(clientWithOverride);
    expect(weekly).toHaveLength(7);
  });

  test("deload day uses reduced exercise", () => {
    const client: ClientSnapshot = {
      ...clientWithOverride,
      weekSchedule: ["deload", "rest", "rest", "rest", "rest", "rest", "rest"],
    };
    const result = calculateTdee(client, "deload");
    expect(result.exercise.exerciseKcal).toBeGreaterThan(0);
    // Deload default is 200kcal * 0.85 = 170
    expect(result.exercise.exerciseKcal).toBe(170);
  });
});

// ── Macros Tests ──────────────────────────────────────────────────────────────

describe("Macros", () => {
  test("training day macros", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const macros = calculateMacros(
      2500,
      bodyFat.bodyComposition,
      85,
      "training"
    );
    // Protein: 2.5 * 72.25 = 180.625 ≈ 181g
    expect(macros.proteinG).toBeCloseTo(181, 0);
    // Fat: 0.9 * 85 = 76.5 ≈ 77g
    expect(macros.fatG).toBeCloseTo(77, 0);
    // Carbs: (2500 - 159*4 - 77*9) / 4
    expect(macros.carbG).toBeGreaterThan(0);
    expect(macros.dayType).toBe("training");
  });

  test("rest day has different macros", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const training = calculateMacros(2500, bodyFat.bodyComposition, 85, "training");
    const rest = calculateMacros(2200, bodyFat.bodyComposition, 85, "rest");
    // Rest has higher fat per kg
    expect(rest.fatG).toBeGreaterThan(training.fatG);
  });

  test("refeed day has lowest fat", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const refeed = calculateMacros(2800, bodyFat.bodyComposition, 85, "refeed");
    const rest = calculateMacros(2200, bodyFat.bodyComposition, 85, "rest");
    expect(refeed.fatG).toBeLessThan(rest.fatG);
  });

  test("macros sum to approximately TDEE", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const macros = calculateMacros(2500, bodyFat.bodyComposition, 85, "training");
    const totalFromMacros =
      macros.proteinG * 4 + macros.fatG * 9 + macros.carbG * 4;
    // Should be within ~10 kcal due to rounding
    expect(Math.abs(totalFromMacros - 2500)).toBeLessThan(15);
  });

  test("custom multiplier overrides", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const macros = calculateMacros(2500, bodyFat.bodyComposition, 85, "training", {
      proteinPerKgLbm: 2.5,
      fatPerKgBw: 0.8,
    });
    expect(macros.proteinG).toBeCloseTo(181, 0); // 2.5 * 72.25
    expect(macros.fatG).toBe(68); // 0.8 * 85
  });

  test("absolute gram override pins protein; fat formula; carbs fills", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const macros = calculateMacros(2500, bodyFat.bodyComposition, 85, "training", {
      absoluteOverrides: { training: { proteinG: 220 } },
    });
    expect(macros.proteinG).toBe(220);
    // Fat formula = 0.9 * 85 = 76.5 → 77
    expect(macros.fatG).toBe(77);
    // Carbs absorb the remainder
    const totalFromMacros =
      macros.proteinG * 4 + macros.fatG * 9 + macros.carbG * 4;
    expect(Math.abs(totalFromMacros - 2500)).toBeLessThan(15);
  });

  test("full absolute override pins all three macros", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const macros = calculateMacros(2500, bodyFat.bodyComposition, 85, "training", {
      absoluteOverrides: { training: { proteinG: 200, fatG: 80, carbG: 350 } },
    });
    expect(macros.proteinG).toBe(200);
    expect(macros.fatG).toBe(80);
    expect(macros.carbG).toBe(350);
    // totalKcal is recomputed from the explicit grams, not the input TDEE
    expect(macros.totalKcal).toBe(200 * 4 + 80 * 9 + 350 * 4);
  });

  test("absolute override scoped to one day-type doesn't leak", () => {
    const bodyFat = estimateBodyFat(clientWithOverride);
    const trainingMacros = calculateMacros(2500, bodyFat.bodyComposition, 85, "training", {
      absoluteOverrides: { training: { proteinG: 250 } },
    });
    const restMacros = calculateMacros(2200, bodyFat.bodyComposition, 85, "rest", {
      absoluteOverrides: { training: { proteinG: 250 } },
    });
    expect(trainingMacros.proteinG).toBe(250);
    // Rest day should fall back to its own formula
    expect(restMacros.proteinG).not.toBe(250);
  });
});

// ── Hydration Tests ───────────────────────────────────────────────────────────

describe("Hydration", () => {
  // D3a (R5, Roberto 2026-07-21): salt = 1 g per litre of the day's water.
  test("rest day hydration — salt follows water (1 g/L)", () => {
    const h = calculateHydration(85, "rest");
    expect(h.waterMl).toBe(3188); // 37.5 * 85 = 3187.5 → 3188
    expect(h.saltG).toBe(3.2); // 3.188 L → 3.2 g
  });

  test("training day adds bonus water; salt scales with it", () => {
    const h = calculateHydration(85, "training");
    expect(h.waterMl).toBe(3688); // 3188 + 500
    expect(h.saltG).toBe(3.7); // 3.688 L → 3.7 g (was flat 6.5 — his complaint)
  });

  test("deload day also gets bonus hydration", () => {
    const h = calculateHydration(85, "deload");
    expect(h.waterMl).toBe(3688);
    expect(h.saltG).toBe(3.7);
  });

  test("Roberto's flagged case can never recur: salt is never water-独立 flat 6.5", () => {
    // any weight in his 30–40 mL/kg water world yields salt ≈ litres, ≤ ~4.5 g
    const heavy = calculateHydration(110, "training");
    expect(heavy.saltG).toBeCloseTo(heavy.waterMl / 1000, 1);
  });
});

// ── Integration: Full Plan ────────────────────────────────────────────────────

describe("Full Plan Generation", () => {
  test("daily plan has all components", () => {
    const plan = generateDailyPlan(clientWithOverride, "training");
    expect(plan.dayType).toBe("training");
    expect(plan.tdee.totalTdeeKcal).toBeGreaterThan(0);
    expect(plan.macros.proteinG).toBeGreaterThan(0);
    expect(plan.macros.fatG).toBeGreaterThan(0);
    expect(plan.macros.carbG).toBeGreaterThan(0);
    expect(plan.hydration.waterMl).toBeGreaterThan(0);
  });

  test("weekly plan returns 7 days", () => {
    const weekly = generateWeeklyPlan(clientWithOverride);
    expect(weekly.days).toHaveLength(7);
    expect(weekly.weeklyAverageKcal).toBeGreaterThan(0);
    expect(weekly.weeklyAverageProteinG).toBeGreaterThan(0);
  });

  test("weekly plan respects schedule", () => {
    const weekly = generateWeeklyPlan(clientWithOverride);
    // Mon, Wed, Fri = training; rest otherwise
    expect(weekly.days[0].dayType).toBe("training");
    expect(weekly.days[1].dayType).toBe("rest");
    expect(weekly.days[2].dayType).toBe("training");
  });

  test("female client produces valid plan", () => {
    const plan = generateDailyPlan(femaleClient, "training");
    expect(plan.macros.proteinG).toBeGreaterThan(0);
    expect(plan.macros.totalKcal).toBeGreaterThan(1000);
    expect(plan.macros.totalKcal).toBeLessThan(4000);
  });

  test("perDayTrainingSession swaps the session on the matching index", () => {
    // Mon (index 0) gets a high-MET session; Wed (index 2) gets a low-MET session.
    // Both are training days in clientWithOverride's schedule.
    const weekly = generateWeeklyPlan(clientWithOverride, {
      perDayTrainingSession: [
        { method: "met_value", durationMin: 90, metValue: 9.0 },
        null,
        { method: "met_value", durationMin: 45, metValue: 4.0 },
      ],
    });
    expect(weekly.days[0].dayType).toBe("training");
    expect(weekly.days[2].dayType).toBe("training");
    expect(weekly.days[0].tdee.exercise.exerciseKcal).toBeGreaterThan(
      weekly.days[2].tdee.exercise.exerciseKcal
    );
  });

  test("perDayTrainingSession is ignored on non-training days", () => {
    // Index 1 = rest day in clientWithOverride. Setting a session there must NOT
    // increase the day's TDEE — rest days zero out exercise.
    const weekly = generateWeeklyPlan(clientWithOverride, {
      perDayTrainingSession: [
        undefined,
        { method: "met_value", durationMin: 60, metValue: 8.0 },
      ],
    });
    expect(weekly.days[1].dayType).toBe("rest");
    expect(weekly.days[1].tdee.exercise.exerciseKcal).toBe(0);
  });

  test("perDayTrainingSession falls back to global trainingSession when entry is null", () => {
    const globalSession = {
      method: "met_value" as const,
      durationMin: 60,
      metValue: 6.0,
    };
    const weekly = generateWeeklyPlan(clientWithOverride, {
      trainingSession: globalSession,
      perDayTrainingSession: [
        null,
        null,
        { method: "met_value", durationMin: 60, metValue: 6.0 }, // same as fallback
      ],
    });
    // Mon (null override) and Wed (explicit equal) should have ~equal exercise kcal
    expect(weekly.days[0].tdee.exercise.exerciseKcal).toBe(
      weekly.days[2].tdee.exercise.exerciseKcal
    );
  });
});

// ── Edge cases: the runtime scenarios tsc can't catch ─────────────────────────
// These mirror the inputs the previewWeek / generate procedures can produce
// from the Phase A–C wizard (all-OFF weeks, deficit + macro pin combos, etc.).

describe("Wizard edge cases", () => {
  const allRest: ClientSnapshot = {
    ...clientWithOverride,
    weekSchedule: ["rest", "rest", "rest", "rest", "rest", "rest", "rest"],
  };

  test("all-OFF week produces 7 valid rest days, no crash", () => {
    const weekly = generateWeeklyPlan(allRest);
    expect(weekly.days).toHaveLength(7);
    for (const d of weekly.days) {
      expect(d.dayType).toBe("rest");
      expect(d.tdee.exercise.exerciseKcal).toBe(0);
      expect(d.macros.proteinG).toBeGreaterThan(0);
      expect(d.macros.carbG).toBeGreaterThanOrEqual(0);
    }
    expect(weekly.weeklyAverageKcal).toBeGreaterThan(0);
  });

  test("perDayTrainingSession on an all-OFF week is ignored (no crash)", () => {
    const weekly = generateWeeklyPlan(allRest, {
      perDayTrainingSession: [
        { method: "met_value", durationMin: 90, metValue: 9 },
        { method: "met_value", durationMin: 60, metValue: 7 },
        null,
        null,
        null,
        null,
        null,
      ],
    });
    expect(weekly.days.every((d) => d.tdee.exercise.exerciseKcal === 0)).toBe(true);
  });

  test("deficit + full macro pin: macros stay pinned, deficit does NOT move them", () => {
    const noDeficit = generateWeeklyPlan(clientWithOverride, {
      macroOptions: { absoluteOverrides: { training: { proteinG: 200, fatG: 80, carbG: 350 } } },
    });
    const withDeficit = generateWeeklyPlan(clientWithOverride, {
      dailyDeficitKcal: 600,
      macroOptions: { absoluteOverrides: { training: { proteinG: 200, fatG: 80, carbG: 350 } } },
    });
    const tA = noDeficit.days.find((d) => d.dayType === "training")!;
    const tB = withDeficit.days.find((d) => d.dayType === "training")!;
    // Fully pinned macros are identical regardless of the deficit
    expect(tB.macros.proteinG).toBe(200);
    expect(tB.macros.fatG).toBe(80);
    expect(tB.macros.carbG).toBe(350);
    expect(tB.macros.totalKcal).toBe(tA.macros.totalKcal);
  });

  test("deficit + protein-only pin: carbs absorb the deficit", () => {
    const noDeficit = generateWeeklyPlan(clientWithOverride, {
      macroOptions: { absoluteOverrides: { training: { proteinG: 200 } } },
    });
    const withDeficit = generateWeeklyPlan(clientWithOverride, {
      dailyDeficitKcal: 500,
      macroOptions: { absoluteOverrides: { training: { proteinG: 200 } } },
    });
    const tA = noDeficit.days.find((d) => d.dayType === "training")!;
    const tB = withDeficit.days.find((d) => d.dayType === "training")!;
    expect(tB.macros.proteinG).toBe(200); // pin holds
    expect(tB.macros.carbG).toBeLessThan(tA.macros.carbG); // deficit lands on carbs
  });

  test("extreme deficit can't drive carbs negative", () => {
    const weekly = generateWeeklyPlan(clientWithOverride, {
      dailyDeficitKcal: 1500, // larger than most of the day's intake
    });
    for (const d of weekly.days) {
      expect(d.macros.carbG).toBeGreaterThanOrEqual(0);
    }
  });
});
