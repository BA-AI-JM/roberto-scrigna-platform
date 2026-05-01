/**
 * Thermic Effect of Food (TEF) calculation.
 *
 * TEF represents the energy cost of digesting, absorbing, and metabolising food.
 * Typically 8-15% of total caloric intake, with higher protein diets at the upper end.
 *
 * Default: 10% of BMR as a reasonable approximation
 * when exact dietary composition is unknown at planning stage.
 */

import type { TefResult } from "./types";

/** Default TEF percentage */
const DEFAULT_TEF_PCT = 10;

/**
 * TEF percentages by diet composition emphasis.
 * - Protein-heavy diets: ~15%
 * - Mixed diets: ~10%
 * - High-fat diets: ~8%
 */
export const TEF_RANGES = {
  high_protein: 15,
  mixed: 10,
  high_fat: 8,
} as const;

export type DietEmphasis = keyof typeof TEF_RANGES;

/**
 * Calculate TEF based on BMR only.
 *
 * @param bmrKcal - Basal metabolic rate in kcal
 * @param dietEmphasis - Optional diet emphasis to adjust TEF %
 * @returns TEF kcal and the percentage used
 */
export function calculateTef(
  bmrKcal: number,
  dietEmphasis?: DietEmphasis
): TefResult {
  const tefPct = dietEmphasis ? TEF_RANGES[dietEmphasis] : DEFAULT_TEF_PCT;
  const tefKcal = Math.round(bmrKcal * (tefPct / 100));

  return {
    tefKcal,
    tefPct,
  };
}
