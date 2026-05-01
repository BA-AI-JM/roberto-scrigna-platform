/**
 * Spec Worked Example A.5 — BJJ Mixed Class (Profile G, GRAPPLING)
 *
 * Pins every intermediate value to the spec exactly.
 * Source: Spec v4.4.1 §Appendix A, Example A.5
 *
 * Client: male, 30y, 70kg
 * Category: GRAPPLING, session_type: mixed, Profile: G
 *
 * Raw data (post-Stage-2, pre-cutoff values already applied):
 *   <Z1=2, Z1=18, Z2=28, Z3=22, Z4=9, Z5=3 → total active = 82 min
 *   device = 780 kcal, Tier 2 device trust
 *
 * Expected final: 342 kcal
 */

import { describe, it, expect } from "vitest";
import { getSportProfile } from "../stage6-met";
import { classifyBelowZ1 } from "../stage4-below-z1";
import { classifyZ1Character } from "../stage5-z1-char";
import { calculateEfficiencyFactor } from "../stage7-efficiency";
import { calculateEEE } from "../stage8-eee";
import { runBenchmark } from "../stage6b-benchmark";
import { propagateUncertainty } from "../stage9-range";
import { compareDeviceKcal } from "../stage10-device";
import type { HRZoneData } from "../types";

// ── Spec A.5 constants ────────────────────────────────────────────────────────

const WEIGHT_KG = 70;
const DEVICE_KCAL = 780;

/** Post-Stage-2 zone data (tail of 13 min already excluded by Stage 2) */
const ZONE_DATA_POST_CUTOFF: HRZoneData = {
  minutesPerZone: [2, 18, 28, 22, 9, 3],
  avgHeartRate: 152,
  totalRecordedMin: 82,
};

const ACTIVE_DURATION = 82; // Stage 3 result

describe("SCP Worked Example A.5 — BJJ Mixed (GRAPPLING, Profile G)", () => {
  // ── Stage 6: Sport Profile ──────────────────────────────────────────────────
  it("Stage 6 — GRAPPLING profile has correct net METs", () => {
    const profile = getSportProfile("GRAPPLING", "mixed");

    expect(profile.metabolicProfile).toBe("G");
    expect(profile.isStrengthCategory).toBe(false);
    expect(profile.z1Character).toBe("moving");

    // Profile G nets: gross - 1.0
    // Z1 moving: 2.3 - 1.0 = 1.3
    expect(profile.netMETs.z1Moving).toBeCloseTo(1.3, 10);
    // Z2: 4.5 - 1.0 = 3.5
    expect(profile.netMETs.z2).toBeCloseTo(3.5, 10);
    // Z3: 7.0 - 1.0 = 6.0
    expect(profile.netMETs.z3).toBeCloseTo(6.0, 10);
    // Z4: cap at 8.0 gross → 8.0 - 1.0 = 7.0
    expect(profile.netMETs.z4).toBeCloseTo(7.0, 10);
    // Z5: cap at 8.5 gross → 8.5 - 1.0 = 7.5
    expect(profile.netMETs.z5).toBeCloseTo(7.5, 10);

    // Below-Z1 defaults
    expect(profile.netMETs.belowZ1WarmUp).toBeCloseTo(1.0, 10);
    expect(profile.netMETs.belowZ1Rest).toBeCloseTo(0.4, 10);
  });

  // ── Stage 4: Below-Z1 ──────────────────────────────────────────────────────
  it("Stage 4 — 2 min below-Z1 classified as Option C warm-up", () => {
    const belowZ1 = classifyBelowZ1(2, "GRAPPLING");

    expect(belowZ1.warmUpMin).toBe(2);       // All 2 min = warm-up (Option C)
    expect(belowZ1.interSetRestMin).toBe(0);  // No inter-set rest
    expect(belowZ1.totalBelowZ1Min).toBe(2);
  });

  // ── Stage 5: Z1 Character ─────────────────────────────────────────────────
  it("Stage 5 — Z1 character is Moving for GRAPPLING", () => {
    const profile = getSportProfile("GRAPPLING", "mixed");
    const z1Char = classifyZ1Character(18, profile);

    expect(z1Char.activeZ1Min).toBe(18);
    expect(z1Char.standingMin).toBe(0);
    expect(z1Char.totalZ1Min).toBe(18);
  });

  // ── Stage 7: Efficiency Factor ────────────────────────────────────────────
  it("Stage 7 — HI fraction 14.6%, E = 0.82", () => {
    const efficiency = calculateEfficiencyFactor(9, 3, 82, "G");

    // hiFraction = (9+3) / 82 = 0.1463...
    expect(efficiency.hiFraction).toBeCloseTo(12 / 82, 10);

    // HI in 10-25% range → E = 0.82 (table lookup)
    expect(efficiency.efficiencyFactor).toBe(0.82);
  });

  // ── Stage 8: EEE Calculation ─────────────────────────────────────────────
  it("Stage 8 — HR model total = 342 kcal (spec A.5)", () => {
    const profile = getSportProfile("GRAPPLING", "mixed");
    const belowZ1 = classifyBelowZ1(2, "GRAPPLING");
    const z1Char = classifyZ1Character(18, profile);
    const efficiency = calculateEfficiencyFactor(9, 3, 82, "G");

    const result = calculateEEE(
      ZONE_DATA_POST_CUTOFF,
      belowZ1,
      z1Char,
      profile,
      efficiency,
      WEIGHT_KG
    );

    // constant = 3.5 × 70 / 200 = 1.225
    // perMinuteKcal = 1.225 × 0.82 = 1.0045
    const constant = (3.5 * WEIGHT_KG) / 200;
    expect(constant).toBeCloseTo(1.225, 10);
    const perMin = constant * 0.82;
    expect(perMin).toBeCloseTo(1.0045, 3);

    // Zone breakdown verification
    const warmup = result.zoneBreakdown.find(z => z.zone === "below_z1_warmup");
    expect(warmup).toBeDefined();
    expect(warmup!.netMET).toBeCloseTo(1.0, 10);
    expect(warmup!.kcal).toBeCloseTo(2 * 1.0 * perMin, 1);  // ≈ 2.01

    const z1 = result.zoneBreakdown.find(z => z.zone === "z1");
    expect(z1).toBeDefined();
    expect(z1!.netMET).toBeCloseTo(1.3, 10);
    expect(z1!.kcal).toBeCloseTo(18 * 1.3 * perMin, 1);  // ≈ 23.51

    const z2 = result.zoneBreakdown.find(z => z.zone === "z2");
    expect(z2!.kcal).toBeCloseTo(28 * 3.5 * perMin, 1);   // ≈ 98.44

    const z3 = result.zoneBreakdown.find(z => z.zone === "z3");
    expect(z3!.kcal).toBeCloseTo(22 * 6.0 * perMin, 1);   // ≈ 132.59

    const z4 = result.zoneBreakdown.find(z => z.zone === "z4");
    expect(z4!.kcal).toBeCloseTo(9 * 7.0 * perMin, 1);    // ≈ 63.28

    const z5 = result.zoneBreakdown.find(z => z.zone === "z5");
    expect(z5!.kcal).toBeCloseTo(3 * 7.5 * perMin, 1);    // ≈ 22.60

    // Spec A.5 total = 342 kcal
    expect(Math.round(result.hrModelKcal)).toBe(342);
  });

  // ── Stage 6b: No Benchmark for GRAPPLING ─────────────────────────────────
  it("Stage 6b — benchmark NOT applied for GRAPPLING category", () => {
    const profile = getSportProfile("GRAPPLING", "mixed");
    const efficiency = calculateEfficiencyFactor(9, 3, 82, "G");

    const benchmark = runBenchmark(
      "mixed",
      WEIGHT_KG,
      ACTIVE_DURATION,
      342,
      profile.isStrengthCategory,
      efficiency.hiFraction,
      2, // belowZ1Min
      efficiency.efficiencyFactor
    );

    expect(benchmark.benchmarkApplied).toBe(false);
    expect(benchmark.blendedKcal).toBe(342); // passes through unchanged
  });

  // ── Stage 9: Uncertainty Range ────────────────────────────────────────────
  it("Stage 9 — uncertainty range brackets 342", () => {
    const profile = getSportProfile("GRAPPLING", "mixed");
    const belowZ1 = classifyBelowZ1(2, "GRAPPLING");
    const z1Char = classifyZ1Character(18, profile);
    const efficiency = calculateEfficiencyFactor(9, 3, 82, "G");

    const uncertainty = propagateUncertainty(
      ZONE_DATA_POST_CUTOFF,
      belowZ1,
      z1Char,
      profile,
      efficiency,
      WEIGHT_KG,
      342,
      0,
      false,
      1
    );

    // Spec says range 330-355
    expect(uncertainty.centralKcal).toBe(342);
    expect(uncertainty.lowKcal).toBeGreaterThanOrEqual(325);
    expect(uncertainty.highKcal).toBeLessThanOrEqual(360);
    expect(uncertainty.lowKcal).toBeLessThan(342);
    expect(uncertainty.highKcal).toBeGreaterThan(342);
  });

  // ── Stage 10: Device Comparison ───────────────────────────────────────────
  it("Stage 10 — correction factor ≈ 0.44 (342/780)", () => {
    const comparison = compareDeviceKcal(DEVICE_KCAL, 342);

    expect(comparison).toBeDefined();
    // correction = 342 / 780 = 0.438...
    expect(comparison!.correctionFactor).toBeCloseTo(342 / 780, 2);
    expect(comparison!.correctionFactor).toBeCloseTo(0.44, 1);
    expect(comparison!.deviceOverestimationPct).toBeGreaterThan(100);
  });
});
