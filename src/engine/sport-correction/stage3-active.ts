/**
 * Stage 3 — Active Duration Calculation
 *
 * Spec v4.4.1: Calculate the active session duration after tail exclusion.
 *
 * activeDuration = totalRecordedMin - tailMinutesExcluded
 */

import type { CutoffResult } from "./types";

/**
 * Calculate active session duration.
 *
 * @param totalRecordedMin - Total recorded duration (from HRZoneData)
 * @param cutoff - Stage 2 cutoff result
 * @returns Active duration in minutes
 */
export function calculateActiveDuration(
  totalRecordedMin: number,
  cutoff: CutoffResult
): number {
  return Math.max(0, totalRecordedMin - cutoff.tailMinutesExcluded);
}
