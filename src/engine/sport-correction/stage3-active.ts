/**
 * Stage 3 — Active Duration Calculation
 *
 * Spec v4.4.1: Calculate the active session duration after tail exclusion.
 *
 * activeDuration = sum of all zone minutes in the adjusted zone data
 *
 * NOTE: Stage 2 already reduces totalRecordedMin in adjustedZoneData when a
 * tail cutoff is applied. Computing activeDuration as
 * (adjustedZoneData.totalRecordedMin - tailMinutesExcluded) would double-subtract
 * the excluded tail. Instead, we sum the adjusted zone minutes directly — they
 * are the ground truth after Stage 2 has done its redistribution.
 */

import type { HRZoneData } from "./types";

/**
 * Calculate active session duration from adjusted zone data.
 *
 * @param adjustedZoneData - Zone data after Stage 2 tail exclusion
 * @returns Active duration in minutes (sum of all zone minutes)
 */
export function calculateActiveDuration(
  adjustedZoneData: HRZoneData
): number {
  return adjustedZoneData.minutesPerZone.reduce((sum, m) => sum + m, 0);
}
