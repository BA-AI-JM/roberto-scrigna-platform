/**
 * Stage 10 — Device Comparison
 *
 * Spec v4.4.1: Compare the protocol result against the device-reported kcal.
 * Quantifies systematic device overestimation for client reporting.
 *
 * Formulas:
 *   correctionFactor       = protocolKcal / deviceKcal
 *   deviceOverestimationPct = ((deviceKcal - protocolKcal) / protocolKcal) × 100
 *
 * Marco Bellini verification:
 *   312 / 410 = 0.761 ≈ 0.76 ✅
 *   ((410 - 312) / 312) × 100 = 31.4% ≈ 31% ✅
 */

import type { DeviceComparison } from "./types";

/**
 * Compare protocol result against device-reported kcal.
 * Returns undefined when no device data is available.
 *
 * @param deviceKcal - Device-reported kcal (e.g., Apple Watch, Garmin)
 * @param protocolKcal - SCP final kcal
 * @returns Device comparison or undefined
 */
export function compareDeviceKcal(
  deviceKcal: number | undefined,
  protocolKcal: number
): DeviceComparison | undefined {
  if (deviceKcal == null || deviceKcal <= 0) return undefined;

  const correctionFactor = protocolKcal / deviceKcal;
  const deviceOverestimationPct =
    ((deviceKcal - protocolKcal) / protocolKcal) * 100;

  return {
    deviceKcal,
    protocolKcal,
    correctionFactor: Math.round(correctionFactor * 1000) / 1000,
    deviceOverestimationPct: Math.round(deviceOverestimationPct * 10) / 10,
  };
}
