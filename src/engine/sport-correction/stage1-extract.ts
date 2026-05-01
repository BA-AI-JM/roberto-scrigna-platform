/**
 * Stage 1 — Raw HR Zone Data Extraction & Validation
 *
 * Spec v4.4.1: Parse HRZoneData, validate zone totals, surface discrepancies.
 * The stage is permissive — it warns but does not fail on minor inconsistencies.
 */

import type { HRZoneData } from "./types";

export interface Stage1Result {
  zoneData: HRZoneData;
  totalZoneMin: number;
  /** True if zone sum diverges from totalRecordedMin by more than ±2 min */
  durationMismatchWarning: boolean;
  durationDiscrepancyMin: number;
}

/**
 * Extract and validate HR zone data.
 *
 * @param hrZoneData - Raw zone data from wearable export
 * @returns Validated zone data with discrepancy flags
 */
export function extractHRZones(hrZoneData: HRZoneData): Stage1Result {
  const totalZoneMin = hrZoneData.minutesPerZone.reduce((sum, m) => sum + m, 0);
  const durationDiscrepancyMin = Math.abs(
    totalZoneMin - hrZoneData.totalRecordedMin
  );
  const durationMismatchWarning = durationDiscrepancyMin > 2;

  return {
    zoneData: hrZoneData,
    totalZoneMin,
    durationMismatchWarning,
    durationDiscrepancyMin,
  };
}
