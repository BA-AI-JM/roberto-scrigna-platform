/**
 * Stage 8 — Exercise Energy Expenditure (EEE) Calculation
 *
 * Spec v4.4.1: Compute per-zone kcal using:
 *   constant = (3.5 × weightKg) / 200      — ACSM unit conversion
 *   perMinuteKcal = constant × E           — efficiency-adjusted base rate
 *   zoneKcal = netMET × perMinuteKcal × zoneMinutes
 *
 * Zone breakdown:
 *   below_z1_warmup: warmUpMin × netMETs.belowZ1WarmUp × perMinuteKcal
 *   below_z1_rest:   interSetRestMin × netMETs.belowZ1Rest × perMinuteKcal
 *   z1:              z1Min × (standingMET or movingMET) × perMinuteKcal
 *   z2–z5:           standard zone METs from netMETs
 *
 * Spec worked example A.7 verification (Hypertrophy, 82kg, E=0.78):
 *   constant = 3.5 × 82 / 200 = 1.435
 *   perMinuteKcal = 1.435 × 0.78 = 1.119
 *   below_z1_warmup: 7  × 1.0 × 1.119 =  7.83
 *   below_z1_rest:  14  × 0.4 × 1.119 =  6.27
 *   z1:             25  × 1.0 × 1.119 = 27.98
 *   z2:             12  × 3.5 × 1.119 = 47.00
 *   z3:              5  × 5.0 × 1.119 = 27.98
 *   z4:              2  × 5.0 × 1.119 = 11.19
 *   Total HR model: 128 kcal ✅
 *
 * Spec worked example A.5 verification (BJJ, 70kg, E=0.82):
 *   constant = 3.5 × 70 / 200 = 1.225
 *   perMinuteKcal = 1.225 × 0.82 = 1.0045
 *   below_z1_warmup: 2  × 1.0 × 1.0045 =  2.01
 *   z1:             18  × 1.3 × 1.0045 = 23.51
 *   z2:             28  × 3.5 × 1.0045 = 98.44
 *   z3:             22  × 6.0 × 1.0045 = 132.59
 *   z4:              9  × 7.0 × 1.0045 = 63.28
 *   z5:              3  × 7.5 × 1.0045 = 22.60
 *   Total HR model: 342 kcal ✅
 */

import type {
  SportProfile,
  BelowZ1Classification,
  Z1Character,
  EfficiencyResult,
  ZoneEEEBreakdown,
  HRZoneData,
} from "./types";

export interface Stage8Result {
  zoneBreakdown: ZoneEEEBreakdown[];
  hrModelKcal: number;
}

/**
 * Calculate HR-model EEE per zone.
 *
 * @param zoneData - Adjusted HR zone data from Stage 2
 * @param belowZ1 - Below-Z1 classification from Stage 4
 * @param z1Char - Z1 character from Stage 5
 * @param sportProfile - Sport profile with net METs from Stage 6
 * @param efficiency - Efficiency result from Stage 7
 * @param weightKg - Client body weight
 * @returns Zone-by-zone EEE breakdown and HR model total
 */
export function calculateEEE(
  zoneData: HRZoneData,
  belowZ1: BelowZ1Classification,
  z1Char: Z1Character,
  sportProfile: SportProfile,
  efficiency: EfficiencyResult,
  weightKg: number
): Stage8Result {
  // ACSM conversion constant: (3.5 mL O₂/kg/min × weightKg) / 200
  const constant = (3.5 * weightKg) / 200;
  const perMinuteKcal = constant * efficiency.efficiencyFactor;

  const { netMETs } = sportProfile;
  const breakdown: ZoneEEEBreakdown[] = [];

  // Below-Z1: warm-up (Option C)
  if (belowZ1.warmUpMin > 0) {
    const met = netMETs.belowZ1WarmUp;
    const kcal = met * perMinuteKcal * belowZ1.warmUpMin;
    breakdown.push({
      zone: "below_z1_warmup",
      minutes: belowZ1.warmUpMin,
      netMET: met,
      kcal,
    });
  }

  // Below-Z1: inter-set rest (Option D)
  if (belowZ1.interSetRestMin > 0) {
    const met = netMETs.belowZ1Rest;
    const kcal = met * perMinuteKcal * belowZ1.interSetRestMin;
    breakdown.push({
      zone: "below_z1_rest",
      minutes: belowZ1.interSetRestMin,
      netMET: met,
      kcal,
    });
  }

  // Z1: apply correct MET based on z1Character (standing vs moving)
  if (z1Char.totalZ1Min > 0) {
    const met =
      z1Char.standingMin > 0 ? netMETs.z1Standing : netMETs.z1Moving;
    const kcal = met * perMinuteKcal * z1Char.totalZ1Min;
    breakdown.push({
      zone: "z1",
      minutes: z1Char.totalZ1Min,
      netMET: met,
      kcal,
    });
  }

  // Z2
  const z2Min = zoneData.minutesPerZone[2];
  if (z2Min > 0) {
    const met = netMETs.z2;
    const kcal = met * perMinuteKcal * z2Min;
    breakdown.push({ zone: "z2", minutes: z2Min, netMET: met, kcal });
  }

  // Z3
  const z3Min = zoneData.minutesPerZone[3];
  if (z3Min > 0) {
    const met = netMETs.z3;
    const kcal = met * perMinuteKcal * z3Min;
    breakdown.push({ zone: "z3", minutes: z3Min, netMET: met, kcal });
  }

  // Z4
  const z4Min = zoneData.minutesPerZone[4];
  if (z4Min > 0) {
    const met = netMETs.z4;
    const kcal = met * perMinuteKcal * z4Min;
    breakdown.push({ zone: "z4", minutes: z4Min, netMET: met, kcal });
  }

  // Z5
  const z5Min = zoneData.minutesPerZone[5];
  if (z5Min > 0) {
    const met = netMETs.z5;
    const kcal = met * perMinuteKcal * z5Min;
    breakdown.push({ zone: "z5", minutes: z5Min, netMET: met, kcal });
  }

  const hrModelKcal = breakdown.reduce((sum, z) => sum + z.kcal, 0);

  return { zoneBreakdown: breakdown, hrModelKcal };
}
