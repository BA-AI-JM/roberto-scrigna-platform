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
    // Raw: 6 * 85 * 1 = 510, after 0.85: 433.5 ≈ 434
    expect(result.exerciseKcal).toBeCloseTo(434, 0);
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
});

// ── Hydration Tests ───────────────────────────────────────────────────────────

describe("Hydration", () => {
  test("rest day hydration", () => {
    const h = calculateHydration(85, "rest");
    expect(h.waterMl).toBe(3188); // 37.5 * 85 = 3187.5 → 3188
    expect(h.saltG).toBe(5);
  });

  test("training day adds bonus water and salt", () => {
    const h = calculateHydration(85, "training");
    expect(h.waterMl).toBe(3688); // 3188 + 500
    expect(h.saltG).toBe(6.5); // 5 + 1.5
  });

  test("deload day also gets bonus hydration", () => {
    const h = calculateHydration(85, "deload");
    expect(h.waterMl).toBe(3688);
    expect(h.saltG).toBe(6.5);
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
});
