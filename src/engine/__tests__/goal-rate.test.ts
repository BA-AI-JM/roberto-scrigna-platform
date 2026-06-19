/**
 * Tests for the target-date deficit calculator.
 */

import { describe, it, expect } from "vitest";
import { computeGoalRate, weeksUntil } from "../goal-rate";

describe("weeksUntil", () => {
  it("returns the gap in weeks for a future date", () => {
    const from = new Date("2026-05-15T00:00:00Z");
    const target = new Date("2026-08-07T00:00:00Z"); // ~12 weeks later
    expect(weeksUntil(target, from)).toBeCloseTo(12, 0);
  });

  it("returns 0 for past dates", () => {
    expect(weeksUntil("2020-01-01", "2026-05-15")).toBe(0);
  });

  it("returns 0 for invalid input", () => {
    expect(weeksUntil("not-a-date", "2026-05-15")).toBe(0);
    expect(weeksUntil("2026-05-15", "not-a-date")).toBe(0);
  });
});

describe("computeGoalRate — fat loss", () => {
  it("comfortable: 0.4 % BW/wk", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 76, // 4 kg
      weeks: 16, // 0.25 kg/wk → 0.31 % BW/wk
      tdeeKcal: 2400,
      leanMassKg: 65,
    });
    expect(r.direction).toBe("fat_loss");
    expect(r.band).toBe("comfortable");
    expect(r.percentBwPerWeek).toBeCloseTo(0.31, 1);
    expect(r.dailyDeficitKcal).toBe(Math.round((0.25 * 7700) / 7));
    expect(r.targetDailyKcal).toBe(2400 - r.dailyDeficitKcal);
    expect(r.belowFloor).toBe(false);
    expect(r.suggestedWeeks).toBeUndefined();
  });

  it("moderate band: 0.6 % BW/wk", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 76,
      weeks: 8, // 0.5 kg/wk → 0.625 % BW/wk
      tdeeKcal: 2600,
      leanMassKg: 65,
    });
    expect(r.band).toBe("moderate");
  });

  it("aggressive band: 0.9 % BW/wk (% TDEE under bump threshold)", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 74,
      weeks: 8, // 0.75 kg/wk → 0.94 % BW/wk → aggressive
      tdeeKcal: 3400, // 825 kcal deficit / 3400 = 24 % TDEE → no bump
      leanMassKg: 65,
    });
    expect(r.band).toBe("aggressive");
  });

  it("extreme via % BW/wk: > 1.0 %", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 70,
      weeks: 8, // 1.25 kg/wk → 1.56 % BW/wk
      tdeeKcal: 3000,
      leanMassKg: 65,
    });
    expect(r.band).toBe("extreme");
    expect(r.suggestedWeeks).toBeDefined();
    expect(r.suggestedWeeks!).toBeGreaterThanOrEqual(13);
  });

  it("bumped to extreme via > 25 % TDEE even when % BW is in aggressive", () => {
    // 90 → 80 in 12 wk: 0.83 kg/wk = 0.93 % BW/wk (aggressive band)
    // Deficit ≈ 917 kcal/day vs 2600 TDEE = 35 % → bump to extreme
    const r = computeGoalRate({
      currentKg: 90,
      targetKg: 80,
      weeks: 12,
      tdeeKcal: 2600,
      leanMassKg: 70,
    });
    expect(r.percentBwPerWeek).toBeCloseTo(0.93, 1);
    expect(r.band).toBe("extreme");
    // Suggested weeks must respect BOTH caps (TDEE cap > BW cap here)
    expect(r.suggestedWeeks!).toBeGreaterThanOrEqual(17);
  });

  it("kcal floor blocks when intake would drop too low", () => {
    // Tiny TDEE + aggressive deficit → below floor
    const r = computeGoalRate({
      currentKg: 60,
      targetKg: 50,
      weeks: 8,
      tdeeKcal: 1800,
      leanMassKg: 45,
    });
    expect(r.belowFloor).toBe(true);
    expect(r.kcalFloor).toBe(Math.max(1200, 45 * 22)); // = 1200
  });

  it("kcal floor scales with lean mass for big clients", () => {
    const r = computeGoalRate({
      currentKg: 100,
      targetKg: 95,
      weeks: 12,
      tdeeKcal: 3200,
      leanMassKg: 80,
    });
    expect(r.kcalFloor).toBe(80 * 22);
  });

  it("kcal floor minimum 1200 even for very lean clients", () => {
    const r = computeGoalRate({
      currentKg: 45,
      targetKg: 44,
      weeks: 4,
      tdeeKcal: 1900,
      leanMassKg: 30, // 30 × 22 = 660 → bumped to 1200
    });
    expect(r.kcalFloor).toBe(1200);
  });
});

describe("computeGoalRate — muscle gain", () => {
  it("comfortable gain: 0.2 % BW/wk", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 82,
      weeks: 16, // 0.125 kg/wk → 0.156 % BW/wk
      tdeeKcal: 2800,
      leanMassKg: 70,
    });
    expect(r.direction).toBe("muscle_gain");
    expect(r.band).toBe("comfortable");
    expect(r.dailyDeficitKcal).toBeLessThan(0); // surplus
    expect(r.targetDailyKcal).toBeGreaterThan(2800);
  });

  it("aggressive gain at 0.45 % BW/wk", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 85,
      weeks: 16, // 0.3125 kg/wk → 0.39 % BW/wk → moderate; bump?
      tdeeKcal: 2800,
      leanMassKg: 70,
    });
    // 0.39% → moderate; surplus 344 kcal/day → 12 % TDEE → no bump
    expect(r.band).toBe("moderate");
  });

  it("extreme gain at 0.6 % BW/wk", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 86,
      weeks: 12, // 0.5 kg/wk → 0.625 % BW/wk → above 0.5 cap → extreme
      tdeeKcal: 2800,
      leanMassKg: 70,
    });
    expect(r.band).toBe("extreme");
    expect(r.suggestedWeeks!).toBeGreaterThan(12);
  });

  it("muscle gain cap is 0.5 % BW/wk", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 85,
      weeks: 16,
      tdeeKcal: 2800,
      leanMassKg: 70,
    });
    expect(r.capPercentBwPerWeek).toBe(0.5);
  });
});

describe("computeGoalRate — maintenance edge cases", () => {
  it("|delta| < 0.5 kg → maintenance regardless of weeks", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 80.3,
      weeks: 8,
      tdeeKcal: 2400,
      leanMassKg: 65,
    });
    expect(r.direction).toBe("maintenance");
    expect(r.dailyDeficitKcal).toBe(0);
    expect(r.targetDailyKcal).toBe(2400);
  });

  it("weeks ≤ 0 → maintenance (caller should clamp)", () => {
    const r = computeGoalRate({
      currentKg: 80,
      targetKg: 75,
      weeks: 0,
      tdeeKcal: 2400,
      leanMassKg: 65,
    });
    expect(r.direction).toBe("maintenance");
  });
});
