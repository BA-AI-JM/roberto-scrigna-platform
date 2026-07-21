/**
 * B2 (#9) — the carb-led tier rule, encoded from Roberto's answers 2026-07-21.
 *
 * His rule, in his frame: the kcal difference between training-day tiers is
 * "added cereals" — real carb food, which carries its own small protein and
 * trace fat. His reference example: +350 kcal ≈ 100 g pasta ≈ ~70 g carbs,
 * 10–15 g protein, 1–2 g fat. So between the lowest training-like day and any
 * higher one, the delta is allocated with cereal composition — never as fat,
 * never as pure carbs either.
 *
 * Reference composition (per 350 kcal, midpoints of his ranges):
 *   protein +12.5 g · fat +1.5 g · carbs absorb the exact remaining kcal
 *   (≈ 71.6 g — "circa 70" in his words; kcal identity preserved exactly).
 *
 * Behaviour (his N4): the engine applies the rule ITSELF and SIGNALS what it
 * changed (adjustments ride the bundle → rendered among the plan assumptions);
 * the coach's per-day-type absolute overrides BYPASS the rule entirely — the
 * manual override he asked to keep.
 *
 * Scope: training-like day types only (training + intensity tiers + double).
 * Rest/refeed/deload keep their own prescriptions. Anchor = the lowest-kcal
 * training-like day; days at anchor kcal are untouched.
 */
import type { DayType } from "./types";
import { isTrainingLikeDayType } from "./types";
import type { MacroOverrideGrams } from "./macros";

export const CEREAL_PROTEIN_G_PER_KCAL = 12.5 / 350;
export const CEREAL_FAT_G_PER_KCAL = 1.5 / 350;

export interface CarbLedAdjustment {
  dayIndex: number;
  dayType: DayType;
  deltaKcal: number;
  proteinBeforeG: number;
  proteinAfterG: number;
  fatBeforeG: number;
  fatAfterG: number;
  carbBeforeG: number;
  carbAfterG: number;
}

interface DayMacrosLike {
  totalKcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

interface DayLike {
  dayType: DayType;
  macros: DayMacrosLike;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Apply the carb-led tier rule IN PLACE on a week's daily plans.
 * Returns the adjustments made (empty when the rule is a no-op).
 */
export function applyCarbLedTierRule(
  days: DayLike[],
  absoluteOverrides?: Partial<Record<DayType, MacroOverrideGrams>>
): CarbLedAdjustment[] {
  const trainingDays = days.filter(
    (d) =>
      isTrainingLikeDayType(d.dayType) &&
      // coach's absolute per-day-type override wins — rule never touches it
      !absoluteOverrides?.[d.dayType]
  );
  if (trainingDays.length < 2) return [];

  const anchor = trainingDays.reduce((lo, d) =>
    d.macros.totalKcal < lo.macros.totalKcal ? d : lo
  );

  const adjustments: CarbLedAdjustment[] = [];
  for (const d of trainingDays) {
    const delta = d.macros.totalKcal - anchor.macros.totalKcal;
    if (delta <= 0) continue;

    const proteinAfter = r1(anchor.macros.proteinG + delta * CEREAL_PROTEIN_G_PER_KCAL);
    const fatAfter = r1(anchor.macros.fatG + delta * CEREAL_FAT_G_PER_KCAL);
    // carbs absorb the exact remaining kcal — total kcal identity preserved
    const carbAfter = r1(
      (d.macros.totalKcal - proteinAfter * 4 - fatAfter * 9) / 4
    );

    const changed =
      Math.abs(proteinAfter - d.macros.proteinG) > 0.05 ||
      Math.abs(fatAfter - d.macros.fatG) > 0.05 ||
      Math.abs(carbAfter - d.macros.carbG) > 0.05;
    if (!changed) continue;

    adjustments.push({
      dayIndex: days.indexOf(d),
      dayType: d.dayType,
      deltaKcal: Math.round(delta),
      proteinBeforeG: d.macros.proteinG,
      proteinAfterG: proteinAfter,
      fatBeforeG: d.macros.fatG,
      fatAfterG: fatAfter,
      carbBeforeG: d.macros.carbG,
      carbAfterG: carbAfter,
    });

    d.macros.proteinG = proteinAfter;
    d.macros.fatG = fatAfter;
    d.macros.carbG = carbAfter;
  }
  return adjustments;
}

/** Human line(s) for the plan assumptions — the rule's visible signal (N4). */
export function carbLedAssumptionLines(adjustments: CarbLedAdjustment[]): string[] {
  if (adjustments.length === 0) return [];
  const per = adjustments
    .map(
      (a) =>
        `+${a.deltaKcal} kcal → C ${a.carbBeforeG}→${a.carbAfterG} g, P ${a.proteinBeforeG}→${a.proteinAfterG} g, F ${a.fatBeforeG}→${a.fatAfterG} g`
    )
    .join("; ");
  return [
    `Regola cereali (Roberto): il surplus dei giorni di allenamento più intensi è allocato come cibo reale a prevalenza di carboidrati (${per}). Gli override macro per giornata scavalcano la regola.`,
  ];
}
