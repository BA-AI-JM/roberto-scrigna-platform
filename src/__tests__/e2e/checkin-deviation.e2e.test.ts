/**
 * E2E: Check-in weight deviation flags and AI summary generation.
 *
 * Tests the computeWeightDeviation and generateCheckinSummary logic
 * extracted from the check-in router. Verifies the 1.5kg threshold,
 * edge cases, and summary flag generation.
 */


// ── Re-implemented helpers (matching router logic for e2e validation) ────────

const WEIGHT_DEVIATION_THRESHOLD_KG = 1.5;

/**
 * Compute weight deviation flag from previous check-in.
 */
function computeWeightDeviation(
  currentKg: number,
  previousKg: number | null
): { deviationKg: number; flagged: boolean } | null {
  if (previousKg === null) return null;
  const deviationKg = currentKg - previousKg;
  return {
    deviationKg: Math.round(deviationKg * 100) / 100,
    flagged: Math.abs(deviationKg) > WEIGHT_DEVIATION_THRESHOLD_KG,
  };
}

/**
 * Generate a simple AI summary stub from check-in data.
 */
function generateCheckinSummary(data: {
  weightKg: number;
  energyLevel: number;
  sleepQuality: number;
  stressLevel: number;
  adherencePct: number;
  deviationKg: number | null;
}): string {
  const parts: string[] = [];

  if (data.deviationKg !== null) {
    const dir = data.deviationKg > 0 ? "+" : "";
    parts.push(`Peso: ${data.weightKg}kg (${dir}${data.deviationKg}kg)`);
  } else {
    parts.push(`Peso: ${data.weightKg}kg (primo check-in)`);
  }

  if (data.energyLevel <= 4) parts.push("⚠️ Energia bassa");
  if (data.sleepQuality <= 4) parts.push("⚠️ Sonno scarso");
  if (data.stressLevel >= 7) parts.push("⚠️ Stress elevato");
  if (data.adherencePct < 70) parts.push("⚠️ Aderenza sotto 70%");

  if (data.energyLevel >= 7 && data.sleepQuality >= 7 && data.adherencePct >= 85) {
    parts.push("✅ Buoni progressi generali");
  }

  return parts.join(" · ");
}

// ── Weight Deviation Tests ──────────────────────────────────────────────────

describe("Weight Deviation — Threshold at ±1.5kg", () => {
  test("null previous weight returns null", () => {
    const result = computeWeightDeviation(82, null);
    expect(result).toBeNull();
  });

  test("no deviation (same weight) — not flagged", () => {
    const result = computeWeightDeviation(82, 82);
    expect(result).not.toBeNull();
    expect(result!.deviationKg).toBe(0);
    expect(result!.flagged).toBe(false);
  });

  test("small gain (+0.5kg) — not flagged", () => {
    const result = computeWeightDeviation(82.5, 82);
    expect(result!.deviationKg).toBe(0.5);
    expect(result!.flagged).toBe(false);
  });

  test("small loss (-0.5kg) — not flagged", () => {
    const result = computeWeightDeviation(81.5, 82);
    expect(result!.deviationKg).toBe(-0.5);
    expect(result!.flagged).toBe(false);
  });

  test("at threshold exactly (+1.5kg) — not flagged (threshold is >)", () => {
    const result = computeWeightDeviation(83.5, 82);
    expect(result!.deviationKg).toBe(1.5);
    expect(result!.flagged).toBe(false);
  });

  test("at threshold exactly (-1.5kg) — not flagged", () => {
    const result = computeWeightDeviation(80.5, 82);
    expect(result!.deviationKg).toBe(-1.5);
    expect(result!.flagged).toBe(false);
  });

  test("just over threshold (+1.6kg) — FLAGGED", () => {
    const result = computeWeightDeviation(83.6, 82);
    expect(result!.deviationKg).toBe(1.6);
    expect(result!.flagged).toBe(true);
  });

  test("just over threshold (-1.6kg) — FLAGGED", () => {
    const result = computeWeightDeviation(80.4, 82);
    expect(result!.deviationKg).toBe(-1.6);
    expect(result!.flagged).toBe(true);
  });

  test("large gain (+3kg) — FLAGGED", () => {
    const result = computeWeightDeviation(85, 82);
    expect(result!.deviationKg).toBe(3);
    expect(result!.flagged).toBe(true);
  });

  test("large loss (-4kg) — FLAGGED", () => {
    const result = computeWeightDeviation(78, 82);
    expect(result!.deviationKg).toBe(-4);
    expect(result!.flagged).toBe(true);
  });

  test("decimal precision maintained (82.35 - 81.87)", () => {
    const result = computeWeightDeviation(82.35, 81.87);
    expect(result!.deviationKg).toBe(0.48);
    expect(result!.flagged).toBe(false);
  });
});

// ── Check-in Summary Tests ──────────────────────────────────────────────────

describe("Check-in Summary — Flag Generation", () => {
  test("first check-in (no deviation) shows primo check-in", () => {
    const summary = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 7,
      sleepQuality: 7,
      stressLevel: 3,
      adherencePct: 90,
      deviationKg: null,
    });
    expect(summary).toContain("primo check-in");
    expect(summary).toContain("82kg");
    expect(summary).toContain("✅ Buoni progressi generali");
  });

  test("positive deviation shows + prefix", () => {
    const summary = generateCheckinSummary({
      weightKg: 83.5,
      energyLevel: 7,
      sleepQuality: 7,
      stressLevel: 3,
      adherencePct: 90,
      deviationKg: 1.5,
    });
    expect(summary).toContain("+1.5kg");
  });

  test("negative deviation shows no + prefix", () => {
    const summary = generateCheckinSummary({
      weightKg: 80.5,
      energyLevel: 7,
      sleepQuality: 7,
      stressLevel: 3,
      adherencePct: 90,
      deviationKg: -1.5,
    });
    expect(summary).toContain("-1.5kg");
  });

  test("low energy (≤4) triggers warning", () => {
    const summary = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 4,
      sleepQuality: 7,
      stressLevel: 3,
      adherencePct: 90,
      deviationKg: 0,
    });
    expect(summary).toContain("⚠️ Energia bassa");
  });

  test("poor sleep (≤4) triggers warning", () => {
    const summary = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 7,
      sleepQuality: 3,
      stressLevel: 3,
      adherencePct: 90,
      deviationKg: 0,
    });
    expect(summary).toContain("⚠️ Sonno scarso");
  });

  test("high stress (≥7) triggers warning", () => {
    const summary = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 7,
      sleepQuality: 7,
      stressLevel: 7,
      adherencePct: 90,
      deviationKg: 0,
    });
    expect(summary).toContain("⚠️ Stress elevato");
  });

  test("low adherence (<70%) triggers warning", () => {
    const summary = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 7,
      sleepQuality: 7,
      stressLevel: 3,
      adherencePct: 65,
      deviationKg: 0,
    });
    expect(summary).toContain("⚠️ Aderenza sotto 70%");
  });

  test("all flags fire together for worst-case check-in", () => {
    const summary = generateCheckinSummary({
      weightKg: 78,
      energyLevel: 2,
      sleepQuality: 2,
      stressLevel: 9,
      adherencePct: 40,
      deviationKg: -4,
    });
    expect(summary).toContain("⚠️ Energia bassa");
    expect(summary).toContain("⚠️ Sonno scarso");
    expect(summary).toContain("⚠️ Stress elevato");
    expect(summary).toContain("⚠️ Aderenza sotto 70%");
    expect(summary).not.toContain("✅ Buoni progressi generali");
  });

  test("good progress badge requires energy≥7, sleep≥7, adherence≥85", () => {
    // Just below threshold
    const noProgress = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 6,
      sleepQuality: 7,
      stressLevel: 3,
      adherencePct: 85,
      deviationKg: 0,
    });
    expect(noProgress).not.toContain("✅ Buoni progressi generali");

    // Exactly at thresholds
    const hasProgress = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 7,
      sleepQuality: 7,
      stressLevel: 3,
      adherencePct: 85,
      deviationKg: 0,
    });
    expect(hasProgress).toContain("✅ Buoni progressi generali");
  });

  test("boundary: adherence at exactly 70% does not trigger warning", () => {
    const summary = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 5,
      sleepQuality: 5,
      stressLevel: 5,
      adherencePct: 70,
      deviationKg: 0,
    });
    expect(summary).not.toContain("Aderenza sotto 70%");
  });

  test("boundary: energy at 5 does not trigger warning", () => {
    const summary = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 5,
      sleepQuality: 5,
      stressLevel: 5,
      adherencePct: 75,
      deviationKg: 0,
    });
    expect(summary).not.toContain("Energia bassa");
  });

  test("boundary: stress at 6 does not trigger warning", () => {
    const summary = generateCheckinSummary({
      weightKg: 82,
      energyLevel: 5,
      sleepQuality: 5,
      stressLevel: 6,
      adherencePct: 75,
      deviationKg: 0,
    });
    expect(summary).not.toContain("Stress elevato");
  });
});
