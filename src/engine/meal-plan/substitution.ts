/**
 * Meal substitution engine.
 * Generates 2-4 alternative meals per slot with similar macro profiles.
 */

import type {
  Allergen,
  MealTag,
  MealTemplate,
  MealType,
  SelectedMeal,
  SlotMacroTargets,
} from "./types";
import { SUBSTITUTION_BOUNDS } from "./types";
import { filterMeals, scoreMeal, type SelectionFilter } from "./selector";
import { scaleMealToTarget } from "./scaler";

/** Options for generating substitutions */
export interface SubstitutionOptions {
  /** All available templates */
  templates: MealTemplate[];
  /** The primary selected meal (to exclude from subs) */
  primaryId: string;
  /** Target macros for the slot */
  target: SlotMacroTargets;
  /** Valid meal types for this slot */
  validTypes: MealType[];
  /** Allergens to exclude */
  excludeAllergens: Allergen[];
  /** Preferred tags */
  preferTags: MealTag[];
  /** Number of substitutions to generate (clamped to 2-4) */
  count: number;
}

/**
 * Generate substitution meals for a slot.
 * Selects the best alternatives (excluding the primary), scaled to match targets.
 */
export function generateSubstitutions(
  options: SubstitutionOptions
): SelectedMeal[] {
  const count = Math.max(
    SUBSTITUTION_BOUNDS.min,
    Math.min(SUBSTITUTION_BOUNDS.max, options.count)
  );

  const filter: SelectionFilter = {
    validTypes: options.validTypes,
    excludeAllergens: options.excludeAllergens,
    preferTags: options.preferTags,
    excludeIds: [options.primaryId],
  };

  const candidates = filterMeals(options.templates, filter);

  // Score and sort
  const scored = candidates
    .map((template) => ({
      template,
      score: scoreMeal(template, options.target, options.preferTags),
    }))
    .sort((a, b) => a.score - b.score);

  // Take top N, scale each to target
  return scored
    .slice(0, count)
    .map((s) => scaleMealToTarget(s.template, options.target));
}
