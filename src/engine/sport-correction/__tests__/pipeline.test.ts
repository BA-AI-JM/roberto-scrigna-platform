/**
 * SCP Public API End-to-End Tests — runSCP() with raw pre-cutoff data
 *
 * These tests call runSCP() directly with raw session data (before any Stage 2
 * cutoff processing) and assert the final exerciseKcal. They guard against
 * regressions such as the Stage 2/3 double-subtraction bug (Finding 1 in the
 * Codex verification), which isolated stage tests missed because they injected
 * post-cutoff data manually.
 *
 * hrStream is provided so that Stage 2 uses the precise stream-based tail
 * detection (which excludes the entire detected tail) rather than the
 * imprecise heuristic (which only excludes excess beyond MAX_COOLDOWN).
 *
 * Spec reference: v4.4.1 §Appendix A, Examples A.5 (BJJ) and A.7 (Hypertrophy).
 */

import { describe, it, expect } from "vitest";
import { runSCP } from "../index";
import type { SCPInput } from "../types";

// ── Helper — build minute-resolution hrStream ─────────────────────────────────

/**
 * Build a per-minute HR stream where the last `tailMin` samples are below
 * the threshold (avgHR × 0.75) and the remaining samples are above it.
 * This simulates a watch left on after the session ended.
 *
 * @param totalMin - Total recording length in minutes
 * @param tailMin - Number of contiguous below-threshold tail minutes
 * @param avgHR - Session average HR (determines threshold: avgHR × 0.75)
 */
function makeHRStream(totalMin: number, tailMin: number, avgHR: number): number[] {
  const threshold = avgHR * 0.75;
  const activeHR = Math.round(avgHR * 1.05);   // above threshold
  const tailHR = Math.round(threshold * 0.9);  // below threshold

  const stream: number[] = [];
  for (let i = 0; i < totalMin - tailMin; i++) {
    stream.push(activeHR);
  }
  for (let i = 0; i < tailMin; i++) {
    stream.push(tailHR);
  }
  return stream;
}

// ── Test A.5 — BJJ Mixed Class (raw input with 13-min tail artifact) ───────────

describe("Pipeline A.5 — BJJ Mixed raw → runSCP() → 342 kcal", () => {
  /**
   * Spec A.5: male, 30y, 70kg, GRAPPLING/mixed, Profile G.
   *
   * Raw recording: [15, 18, 28, 22, 9, 3], total=95 min (13 min tail artifact).
   * Stage 2 (hrStream path): detects 13-min tail → excluded=13.
   * Post-cutoff: [2, 18, 28, 22, 9, 3], total=82.
   * Stage 3: active = sum(adjusted zones) = 82.
   * Stage 7: HI fraction = 12/82 = 14.6% → E = 0.82 (table: 10–25%).
   * Stage 8: HR model = 342 kcal.
   * Stage 6b: not triggered (GRAPPLING, not STRENGTH).
   * Final: 342 kcal.
   */

  const RAW_INPUT: SCPInput = {
    categoryId: "GRAPPLING",
    sessionType: "mixed",
    durationMin: 95,
    weightKg: 70,
    ageYears: 30,
    sex: "male",
    deviceKcal: 780,
    hrZoneData: {
      minutesPerZone: [15, 18, 28, 22, 9, 3],
      avgHeartRate: 152,
      totalRecordedMin: 95,
      // hrStream: last 13 min below threshold (avgHR×0.75 = 114)
      hrStream: makeHRStream(95, 13, 152),
    },
  };

  it("A.5 raw — Stage 2 detects 13-min tail via hrStream", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    // Stage 2 should have applied the cutoff
    expect(result!.cutoff.cutoffApplied).toBe(true);
    expect(result!.cutoff.tailMinutesExcluded).toBe(13);
    expect(result!.cutoff.cutoffReason).toBe("hr_stream_tail");
  });

  it("A.5 raw — post-cutoff below-Z1 = 2 min, active duration = 82 min", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    // Adjusted zone data: [2, 18, 28, 22, 9, 3]
    expect(result!.cutoff.adjustedZoneData.minutesPerZone[0]).toBe(2);
    expect(result!.cutoff.adjustedZoneData.totalRecordedMin).toBe(82);

    // Stage 3 sums zone minutes — NOT double-subtracting
    expect(result!.activeDurationMin).toBe(82);
  });

  it("A.5 raw — Stage 4 classifies 2 min below-Z1 as warm-up only (Option C)", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.belowZ1.warmUpMin).toBe(2);
    expect(result!.belowZ1.interSetRestMin).toBe(0);
    expect(result!.belowZ1.totalBelowZ1Min).toBe(2);
  });

  it("A.5 raw — Stage 7: E = 0.82 (HI fraction 14.6%, table range 10–25%)", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.efficiency.hiFraction).toBeCloseTo(12 / 82, 4);
    expect(result!.efficiency.efficiencyFactor).toBe(0.82);
  });

  it("A.5 raw — Stage 6b not applied (GRAPPLING, not STRENGTH)", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.benchmark).toBeUndefined();
  });

  it("A.5 raw — final exerciseKcal = 342 (spec A.5)", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.exerciseKcal).toBe(342);
  });
});

// ── Test A.7 — Hypertrophy (raw input with 15-min tail artifact) ───────────────

describe("Pipeline A.7 — Hypertrophy raw → runSCP() → 155 kcal", () => {
  /**
   * Spec A.7: male, 34y, 82kg, STRENGTH/hypertrophy, Profile G.
   *
   * Raw recording: [36, 25, 12, 5, 2, 0], total=80 min (15 min tail artifact).
   * Stage 2 (hrStream path): detects 15-min tail → excluded=15.
   * Post-cutoff: [21, 25, 12, 5, 2, 0], total=65.
   * Stage 3: active = sum(adjusted zones) = 65.
   * Stage 4: 7 min warm-up (Option C) + 14 min inter-set rest (Option D).
   * Stage 7: HI fraction = 2/65 = 3.1% → E = 0.78 (formula region).
   * Stage 8: HR model = 128 kcal.
   * Stage 6b: trigger fires (active≥40, HI≤10%, low-intensity 70.8%≥50%),
   *           benchmark = 182 kcal, midpoint = (128+182)/2 = 155 kcal.
   * Final: 155 kcal.
   */

  const RAW_INPUT: SCPInput = {
    categoryId: "STRENGTH",
    sessionType: "hypertrophy",
    durationMin: 80,
    weightKg: 82,
    ageYears: 34,
    sex: "male",
    deviceKcal: 410,
    hrZoneData: {
      minutesPerZone: [36, 25, 12, 5, 2, 0],
      avgHeartRate: 112,
      totalRecordedMin: 80,
      // hrStream: last 15 min below threshold (avgHR×0.75 = 84)
      hrStream: makeHRStream(80, 15, 112),
    },
  };

  it("A.7 raw — Stage 2 detects 15-min tail via hrStream", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.cutoff.cutoffApplied).toBe(true);
    expect(result!.cutoff.tailMinutesExcluded).toBe(15);
    expect(result!.cutoff.cutoffReason).toBe("hr_stream_tail");
  });

  it("A.7 raw — post-cutoff below-Z1 = 21 min, active duration = 65 min", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    // Adjusted zone data: [21, 25, 12, 5, 2, 0]
    expect(result!.cutoff.adjustedZoneData.minutesPerZone[0]).toBe(21);
    expect(result!.cutoff.adjustedZoneData.totalRecordedMin).toBe(65);

    // Stage 3 sums zone minutes — NOT double-subtracting
    expect(result!.activeDurationMin).toBe(65);
  });

  it("A.7 raw — Stage 4: 7 min warm-up (C) + 14 min inter-set rest (D)", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.belowZ1.warmUpMin).toBe(7);
    expect(result!.belowZ1.interSetRestMin).toBe(14);
    expect(result!.belowZ1.totalBelowZ1Min).toBe(21);
  });

  it("A.7 raw — Stage 7: E = 0.78 (HI fraction 3.1%, formula region)", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.efficiency.hiFraction).toBeCloseTo(2 / 65, 4);
    expect(result!.efficiency.efficiencyFactor).toBe(0.78);
  });

  it("A.7 raw — Stage 8: HR model = 128 kcal", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    // HR model total before benchmark blending
    const hrModelEntry = result!.zoneBreakdown.reduce((sum, z) => sum + z.kcal, 0);
    expect(Math.round(hrModelEntry)).toBe(128);
  });

  it("A.7 raw — Stage 6b applied: benchmark ≈ 182 kcal, midpoint = 155 kcal", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.benchmark).toBeDefined();
    expect(result!.benchmark!.benchmarkApplied).toBe(true);
    expect(result!.benchmark!.hrModelKcal).toBe(128);
    expect(result!.benchmark!.benchmarkKcal).toBeCloseTo(182, 3);
    expect(result!.benchmark!.blendedKcal).toBe(155);
  });

  it("A.7 raw — final exerciseKcal = 155 (spec A.7)", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.exerciseKcal).toBe(155);
  });

  it("A.7 raw — Stage 10: correction factor ≈ 0.38 (155/410)", () => {
    const result = runSCP(RAW_INPUT);
    expect(result).not.toBeNull();

    expect(result!.deviceComparison).toBeDefined();
    expect(result!.deviceComparison!.correctionFactor).toBeCloseTo(155 / 410, 2);
  });
});

// ── Double-subtraction regression guard ───────────────────────────────────────

describe("Stage 3 — double-subtraction regression guard", () => {
  /**
   * Verifies that when Stage 2 excludes a tail (via hrStream), Stage 3 does NOT
   * subtract tailMinutesExcluded a second time. Without the fix, activeDurationMin
   * would be (adjustedTotal - tailExcluded) instead of sum(adjustedZones).
   *
   * With a 13-min tail excluded from 95 min total:
   *   Bug:  adjustedTotal(82) - tailExcluded(13) = 69 min (wrong)
   *   Fix:  sum([2,18,28,22,9,3]) = 82 min (correct)
   */
  it("activeDurationMin = sum of adjusted zone minutes, not double-subtracted", () => {
    const input: SCPInput = {
      categoryId: "GRAPPLING",
      sessionType: "mixed",
      durationMin: 95,
      weightKg: 70,
      ageYears: 30,
      sex: "male",
      hrZoneData: {
        minutesPerZone: [15, 18, 28, 22, 9, 3],
        avgHeartRate: 152,
        totalRecordedMin: 95,
        hrStream: makeHRStream(95, 13, 152),
      },
    };

    const result = runSCP(input);
    expect(result).not.toBeNull();

    // 13-min tail excluded → adjustedTotal = 82
    expect(result!.cutoff.tailMinutesExcluded).toBe(13);
    expect(result!.cutoff.adjustedZoneData.totalRecordedMin).toBe(82);

    // Correct: active = sum(adjusted zones) = 82
    // Buggy:   active = 82 - 13 = 69
    expect(result!.activeDurationMin).toBe(82);
    expect(result!.activeDurationMin).not.toBe(69);
  });
});
