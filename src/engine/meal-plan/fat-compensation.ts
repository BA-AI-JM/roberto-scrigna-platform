/**
 * Fat compensation rules for meal plan balancing.
 * When a meal slot overshoots fat, compensate in adjacent slots.
 */

import type { MealSlot, SlotMacroTargets } from "./types";

/** Fat compensation result for a set of slots */
export interface FatCompensationResult {
  /** Adjusted slot targets */
  adjustedTargets: SlotMacroTargets[];
  /** Total fat delta redistributed (grams) */
  fatRedistributedG: number;
}

/**
 * Apply fat compensation across meal slots.
 *
 * Rules:
 * - If a slot's primary meal exceeds fat target by >5g, reduce fat in other slots
 * - Redistribute excess fat proportionally across remaining slots
 * - Never reduce a slot's fat target below 5g
 * - Compensate kcal deficit from fat reduction by adding carbs (4:9 ratio)
 */
export function applyFatCompensation(
  slots: MealSlot[]
): FatCompensationResult {
  const adjustedTargets = slots.map((s) => ({ ...s.targetMacros }));
  let totalRedistributed = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const target = adjustedTargets[i]!;
    const actual = slot.primary.actualMacros;

    // Check if fat is over by more than 5g
    const fatExcess = actual.fatG - target.fatG;
    if (fatExcess <= 5) continue;

    // Calculate how much to redistribute
    const toRedistribute = fatExcess;
    totalRedistributed += toRedistribute;

    // Find other slots that can absorb the reduction
    const otherIndices = slots
      .map((_, idx) => idx)
      .filter((idx) => idx !== i && adjustedTargets[idx]!.fatG > 5);

    if (otherIndices.length === 0) continue;

    // Distribute proportionally by current fat allocation
    const totalOtherFat = otherIndices.reduce(
      (sum, idx) => sum + adjustedTargets[idx]!.fatG,
      0
    );

    for (const idx of otherIndices) {
      const otherTarget = adjustedTargets[idx]!;
      const share = totalOtherFat > 0 ? otherTarget.fatG / totalOtherFat : 0;
      const fatReduction = toRedistribute * share;

      // Don't reduce below 5g
      const actualReduction = Math.min(fatReduction, otherTarget.fatG - 5);
      otherTarget.fatG = Math.round((otherTarget.fatG - actualReduction) * 10) / 10;

      // Compensate kcal: 1g fat = 9kcal, add as carbs (1g carb = 4kcal)
      const kcalToCompensate = actualReduction * 9;
      const carbsToAdd = kcalToCompensate / 4;
      otherTarget.carbsG = Math.round((otherTarget.carbsG + carbsToAdd) * 10) / 10;

      // Kcal stays roughly the same (fat kcal replaced by carb kcal)
      // Small rounding difference acceptable
    }
  }

  return { adjustedTargets, fatRedistributedG: totalRedistributed };
}
