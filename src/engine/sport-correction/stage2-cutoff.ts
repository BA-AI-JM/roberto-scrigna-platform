/**
 * Stage 2 — Tail Exclusion / Cutoff Detection
 *
 * Spec v4.4.1: Detect and exclude "tail artifacts" — time recorded after the
 * session ended (watch left on). These appear as a sustained block of below-Z1
 * time at the end of the recording.
 *
 * Heuristic (when hrStream is unavailable):
 * - Allow up to 5 minutes of terminal below-Z1 as cool-down
 * - If below-Z1 time exceeds 10 minutes, exclude the excess beyond 5 minutes
 * - If below-Z1 constitutes >15% of total session, flag for exclusion
 */

import type { HRZoneData, CutoffResult } from "./types";

/** Maximum cool-down minutes to allow before triggering cutoff */
const MAX_COOLDOWN_MIN = 5;
/** Minimum below-Z1 that triggers cutoff heuristic */
const CUTOFF_TRIGGER_MIN = 10;
/** Fraction of total session below-Z1 that also triggers cutoff */
const CUTOFF_TRIGGER_FRACTION = 0.15;

/**
 * Detect tail artifacts and return adjusted zone data.
 *
 * @param zoneData - Validated HR zone data from Stage 1
 * @returns Cutoff result with adjusted zone data
 */
export function detectCutoff(zoneData: HRZoneData): CutoffResult {
  const totalMin = zoneData.totalRecordedMin;
  const belowZ1Min = zoneData.minutesPerZone[0];

  // Determine excess below-Z1 beyond the allowed cool-down
  const excessBelowZ1 = belowZ1Min - MAX_COOLDOWN_MIN;
  const fractionBelowZ1 = belowZ1Min / totalMin;

  const shouldCutoff =
    belowZ1Min > CUTOFF_TRIGGER_MIN &&
    (excessBelowZ1 > 0 || fractionBelowZ1 > CUTOFF_TRIGGER_FRACTION);

  if (!shouldCutoff) {
    return {
      tailMinutesExcluded: 0,
      adjustedZoneData: zoneData,
      cutoffApplied: false,
    };
  }

  // hrStream path: find the last contiguous below-Z1 block
  if (zoneData.hrStream && zoneData.hrStream.length > 0) {
    const tailMin = detectStreamTail(zoneData.hrStream, zoneData);
    if (tailMin > MAX_COOLDOWN_MIN) {
      const excluded = tailMin - MAX_COOLDOWN_MIN;
      return buildCutoffResult(zoneData, excluded, "hr_stream_tail");
    }
  }

  // Heuristic path: exclude beyond 5 min cool-down
  const excluded = Math.max(0, excessBelowZ1);
  if (excluded <= 0) {
    return {
      tailMinutesExcluded: 0,
      adjustedZoneData: zoneData,
      cutoffApplied: false,
    };
  }

  return buildCutoffResult(zoneData, excluded, "heuristic_excess_below_z1");
}

/** Build the adjusted zone data given an exclusion amount */
function buildCutoffResult(
  zoneData: HRZoneData,
  excluded: number,
  reason: string
): CutoffResult {
  const newBelowZ1 = Math.max(0, zoneData.minutesPerZone[0] - excluded);
  const adjustedZoneData: HRZoneData = {
    ...zoneData,
    minutesPerZone: [
      newBelowZ1,
      zoneData.minutesPerZone[1],
      zoneData.minutesPerZone[2],
      zoneData.minutesPerZone[3],
      zoneData.minutesPerZone[4],
      zoneData.minutesPerZone[5],
    ],
    totalRecordedMin: zoneData.totalRecordedMin - excluded,
  };

  return {
    tailMinutesExcluded: excluded,
    adjustedZoneData,
    cutoffApplied: true,
    cutoffReason: reason,
  };
}

/**
 * Detect the length of the terminal below-Z1 block in a HR stream.
 * The stream is assumed to be in chronological order (minute or second resolution).
 * A sample is "below Z1" when its HR is below the session average — a rough proxy
 * for below-zone since zone boundaries are not passed to this stage.
 */
function detectStreamTail(
  hrStream: number[],
  zoneData: HRZoneData
): number {
  // Use the session average as a below-Z1 proxy threshold
  const threshold = zoneData.avgHeartRate * 0.75;
  let tailCount = 0;

  for (let i = hrStream.length - 1; i >= 0; i--) {
    if ((hrStream[i] ?? 0) < threshold) {
      tailCount++;
    } else {
      break;
    }
  }

  // Convert samples to minutes (assume 1-sample-per-minute if < 200 samples,
  // otherwise assume 1-sample-per-second)
  const isSecondResolution = hrStream.length > 200;
  return isSecondResolution ? tailCount / 60 : tailCount;
}
