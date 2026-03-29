/**
 * Meal template selection with allergen/tag filtering and macro scoring.
 * Selects the best-matching meals for each slot based on macro proximity.
 */

import type {
  Allergen,
  MealTag,
  MealTemplate,
  MealType,
  SlotMacroTargets,
} from "./types";

/** Options for filtering meal candidates */
export interface SelectionFilter {
  /** Valid meal types for the slot */
  validTypes: MealType[];
  /** Allergens to exclude */
  excludeAllergens: Allergen[];
  /** Preferred tags (boost score if matched) */
  preferTags: MealTag[];
  /** Template IDs already selected (avoid repeats) */
  excludeIds: string[];
}

/** Scored meal candidate */
export interface ScoredMeal {
  /** The meal template */
  template: MealTemplate;
  /** Composite score (lower is better) */
  score: number;
}

/**
 * Filter meal templates by type, allergens, and active status.
 * Returns only templates that pass all hard filters.
 */
export function filterMeals(
  templates: MealTemplate[],
  filter: SelectionFilter
): MealTemplate[] {
  return templates.filter((t) => {
    // Must be active
    if (!t.isActive) return false;

    // Must match one of the valid types
    if (!filter.validTypes.includes(t.mealType)) return false;

    // Must not contain excluded allergens
    if (
      filter.excludeAllergens.length > 0 &&
      t.allergens.some((a) => filter.excludeAllergens.includes(a))
    ) {
      return false;
    }

    // Exclude already-selected IDs
    if (filter.excludeIds.includes(t.id)) return false;

    return true;
  });
}

/**
 * Score a meal template against target macros.
 * Lower score = better match. Uses weighted normalized distance.
 */
export function scoreMeal(
  template: MealTemplate,
  target: SlotMacroTargets,
  preferTags: MealTag[]
): number {
  // Normalized distance for each macro (0 = perfect match)
  const pDiff =
    target.proteinG > 0
      ? Math.abs(template.proteinG - target.proteinG) / target.proteinG
      : 0;
  const fDiff =
    target.fatG > 0
      ? Math.abs(template.fatG - target.fatG) / target.fatG
      : 0;
  const cDiff =
    target.carbsG > 0
      ? Math.abs(template.carbsG - target.carbsG) / target.carbsG
      : 0;
  const eDiff =
    target.kcal > 0
      ? Math.abs(template.kcalPerServing - target.kcal) / target.kcal
      : 0;

  // Weighted: protein and kcal matter most
  const macroScore = pDiff * 0.35 + fDiff * 0.2 + cDiff * 0.2 + eDiff * 0.25;

  // Tag bonus: reduce score if preferred tags match
  const tagMatchCount = preferTags.filter((tag) =>
    template.tags.includes(tag)
  ).length;
  const tagBonus = tagMatchCount > 0 ? tagMatchCount * 0.05 : 0;

  return Math.max(0, macroScore - tagBonus);
}

/**
 * Select the best N meals for a slot from the template pool.
 * Returns meals sorted by score (best first).
 */
export function selectMeals(
  templates: MealTemplate[],
  target: SlotMacroTargets,
  filter: SelectionFilter,
  count: number
): ScoredMeal[] {
  const candidates = filterMeals(templates, filter);

  const scored: ScoredMeal[] = candidates.map((template) => ({
    template,
    score: scoreMeal(template, target, filter.preferTags),
  }));

  scored.sort((a, b) => a.score - b.score);

  return scored.slice(0, count);
}
