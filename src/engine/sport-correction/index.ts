/**
 * Sport Correction Protocol (SCP) — Pipeline Orchestrator
 *
 * Public API for the 10-stage exercise energy expenditure pipeline.
 * Spec: v4.4 / v4.4.1 (Roberto Scrigna Nutrition Platform)
 *
 * Usage:
 *   import { runSCP } from "./sport-correction";
 *   const result = runSCP(input);
 *   // result.exerciseKcal — compatible with ExerciseResult
 *
 * Tier routing:
 *   Tier 1 (HR zones + sport profile)  → Full 10-stage pipeline
 *   Tier 2 (average HR only)           → Returns null (caller uses Keytel fallback)
 *   Tier 3 (RPE/MET/estimate only)     → Returns null (caller uses MET/estimate fallback)
 *
 * SCP only produces a result for Tier 1 inputs. For Tier 2/3 the existing
 * exercise.ts methods remain authoritative.
 */

import type { SCPInput, SCPResult } from "./types";
import { classifyDataTier } from "./stage0-tier";
import { extractHRZones } from "./stage1-extract";
import { detectCutoff } from "./stage2-cutoff";
import { calculateActiveDuration } from "./stage3-active";
import { classifyBelowZ1 } from "./stage4-below-z1";
import { classifyZ1Character } from "./stage5-z1-char";
import { getSportProfile } from "./stage6-met";
import { runBenchmark } from "./stage6b-benchmark";
import { calculateEfficiencyFactor } from "./stage7-efficiency";
import { calculateEEE } from "./stage8-eee";
import { propagateUncertainty } from "./stage9-range";
import { compareDeviceKcal } from "./stage10-device";

// Re-export types for consumers
export type {
  SCPInput,
  SCPResult,
  HRZoneData,
  CategoryId,
  SessionType,
  SportProfile,
  MetabolicProfile,
  TierResult,
  CutoffResult,
  BelowZ1Classification,
  Z1Character,
  BenchmarkResult,
  EfficiencyResult,
  ZoneEEEBreakdown,
  UncertaintyRange,
  DeviceComparison,
  DataTier,
} from "./types";

export { getSportProfile, CATEGORY_PROFILE } from "./stage6-met";

/**
 * Run the Sport Correction Protocol pipeline.
 *
 * Returns a complete SCPResult for Tier 1 inputs (HR zones + sport profile).
 * Returns null for Tier 2/3 — the caller should use the legacy Keytel/MET path.
 *
 * @param input - SCP input data
 * @returns Full SCP result or null if data tier < 1
 */
export function runSCP(input: SCPInput): SCPResult | null {
  // ── Stage 0: Data Quality Tier ───────────────────────────────────────────────
  const tier = classifyDataTier(input);

  if (tier.tier !== 1 || input.hrZoneData == null) {
    // Tier 2/3: fall back to legacy methods — return null to signal caller
    return null;
  }

  // ── Input Validation ─────────────────────────────────────────────────────────
  if (input.weightKg <= 0) {
    // Can't compute EEE without a valid weight — ACSM formula divides by 200 * weight
    return null;
  }
  if (input.hrZoneData.minutesPerZone.every(m => m === 0)) {
    // No zone data to process — all zones are zero
    return null;
  }

  // ── Stage 1: Extract HR Zones ────────────────────────────────────────────────
  const stage1 = extractHRZones(input.hrZoneData);

  // ── Stage 2: Cutoff Detection ─────────────────────────────────────────────────
  const cutoff = detectCutoff(stage1.zoneData);
  const adjustedZoneData = cutoff.adjustedZoneData;

  // ── Stage 3: Active Duration ─────────────────────────────────────────────────
  // Sum adjusted zone minutes directly — Stage 2 already reduced totalRecordedMin,
  // so passing it through would double-subtract the excluded tail.
  const activeDurationMin = calculateActiveDuration(adjustedZoneData);

  // ── Stage 6: Sport Profile / MET Assignment ───────────────────────────────────
  // Computed early because Stages 4 and 5 depend on the profile
  const sportProfile = getSportProfile(input.categoryId, input.sessionType);

  // ── Stage 4: Below-Z1 Classification ─────────────────────────────────────────
  const belowZ1Min = adjustedZoneData.minutesPerZone[0];
  const belowZ1 = classifyBelowZ1(belowZ1Min, input.categoryId);

  // ── Stage 5: Z1 Character ────────────────────────────────────────────────────
  const z1Min = adjustedZoneData.minutesPerZone[1];
  const z1Character = classifyZ1Character(z1Min, sportProfile);

  // ── Stage 7: Efficiency Factor ───────────────────────────────────────────────
  // Computed before Stage 8 because Stage 8 needs E.
  // CYCLIC profile always has E=1.0 (no sympathetic drive correction needed).
  const z4Min = adjustedZoneData.minutesPerZone[4];
  const z5Min = adjustedZoneData.minutesPerZone[5];
  const efficiency = calculateEfficiencyFactor(
    z4Min,
    z5Min,
    activeDurationMin,
    sportProfile.metabolicProfile
  );

  // ── Stage 8: Calculate EEE (HR model) ────────────────────────────────────────
  const stage8 = calculateEEE(
    adjustedZoneData,
    belowZ1,
    z1Character,
    sportProfile,
    efficiency,
    input.weightKg
  );

  // ── Stage 6b: Benchmark Check ────────────────────────────────────────────────
  // Applied after Stage 8 because it needs the HR model total and E.
  const benchmark = runBenchmark(
    input.sessionType,
    input.weightKg,
    activeDurationMin,
    stage8.hrModelKcal,
    sportProfile.isStrengthCategory,
    efficiency.hiFraction,
    belowZ1Min,
    efficiency.efficiencyFactor,
    z1Min
  );

  const finalKcal = benchmark.benchmarkApplied
    ? benchmark.blendedKcal
    : Math.round(stage8.hrModelKcal);

  // ── Stage 9: Uncertainty Range ────────────────────────────────────────────────
  const uncertainty = propagateUncertainty(
    adjustedZoneData,
    belowZ1,
    z1Character,
    sportProfile,
    efficiency,
    input.weightKg,
    finalKcal,
    benchmark.benchmarkKcal,
    benchmark.benchmarkApplied,
    tier.tier
  );

  // ── Stage 10: Device Comparison ───────────────────────────────────────────────
  const deviceComparison = compareDeviceKcal(input.deviceKcal, finalKcal);

  return {
    tier,
    cutoff,
    activeDurationMin,
    belowZ1,
    z1Character,
    benchmark: benchmark.benchmarkApplied ? benchmark : undefined,
    efficiency,
    zoneBreakdown: stage8.zoneBreakdown,
    totalEEEKcal: finalKcal,
    uncertainty,
    deviceComparison,
    methodUsed: "sport_correction_protocol",
    exerciseKcal: finalKcal,
    recalibrationFactor: 1.0,
  };
}
