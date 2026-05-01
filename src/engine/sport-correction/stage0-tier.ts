/**
 * Stage 0 — Data Quality Tier Classification
 *
 * Spec v4.4.1: Determines which pipeline path to execute based on
 * the richness of available input data.
 *
 * Tier 1: HR zone data + sport profile → full SCP pipeline (Stages 1-10)
 * Tier 2: Average HR only, no zones → Keytel formula + 0.85 factor (legacy)
 * Tier 3: RPE/MET/estimate only → MET × weight × duration or direct estimate
 */

import type { SCPInput, TierResult } from "./types";

/**
 * Classify input data into a quality tier.
 *
 * @param input - SCP input data
 * @returns Tier classification with reasoning
 */
export function classifyDataTier(input: SCPInput): TierResult {
  const hasHRZones =
    input.hrZoneData != null &&
    input.hrZoneData.minutesPerZone.length === 6 &&
    input.hrZoneData.totalRecordedMin > 0;

  const hasSportProfile =
    input.categoryId != null && input.sessionType != null;
  const hasDeviceData = input.deviceKcal != null && input.deviceKcal > 0;

  if (hasHRZones && hasSportProfile) {
    return {
      tier: 1,
      reason: "HR zone data and sport profile available — full SCP pipeline",
      hasHRZones,
      hasSportProfile,
      hasDeviceData,
    };
  }

  if (input.avgHeartRate != null && input.avgHeartRate > 0) {
    return {
      tier: 2,
      reason: "Average HR only (no zone breakdown) — Keytel formula fallback",
      hasHRZones: false,
      hasSportProfile,
      hasDeviceData,
    };
  }

  return {
    tier: 3,
    reason: "No HR data — MET/estimate fallback",
    hasHRZones: false,
    hasSportProfile,
    hasDeviceData,
  };
}
