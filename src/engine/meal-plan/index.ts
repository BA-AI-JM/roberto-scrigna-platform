/**
 * Meal Plan Creator Engine
 *
 * Generates complete day meal plans with:
 * - Distribution-based macro allocation (3-6 meals)
 * - Template matching with allergen/tag filtering
 * - Ingredient scaling (0.7-1.4x)
 * - Substitution generation (2-4 per slot)
 * - Fat compensation rules
 * - Tolerance band tightening (P±10g F±10g C±15g E±100kcal)
 */

// Types
export type {
  MealType,
  Allergen,
  MealTag,
  MealIngredient,
  MealTemplate,
  SlotAllocation,
  DistributionTemplate,
  SlotMacroTargets,
  SelectedMeal,
  MealSlot,
  MealPlanConfig,
  MacroDeviation,
  DayMealPlan,
  SourcePin,
  PinnableCategory,
} from "./types";

export { SCALE_BOUNDS, SUBSTITUTION_BOUNDS } from "./types";
export { FIBRE_RESTRICTION_CAP_G, SODIUM_RESTRICTION_CAP_MG } from "./types";

// Distribution
export { getDistribution, DISTRIBUTION_TEMPLATES } from "./distribution";

// Selection
export { filterMeals, scoreMeal, selectMeals } from "./selector";
export type { SelectionFilter, ScoredMeal } from "./selector";

// Scaling
export {
  calculateScaleFactor,
  scaleIngredients,
  scaledMacros,
  scaleMealToTarget,
} from "./scaler";

// Substitution
export { generateSubstitutions } from "./substitution";
export type { SubstitutionOptions } from "./substitution";

// Fat Compensation
export { applyFatCompensation } from "./fat-compensation";
export type { FatCompensationResult } from "./fat-compensation";

// Main API
export { createMealPlan } from "./planner";
export { foodCatalogue } from "./solver";
// #20 item-level food swap (coach) — alternatives + item-local gram recalc.
export {
  getIngredientAlternatives,
  recomputeSwappedIngredient,
  classifyFood,
  macrosFromIngredients,
} from "./solver";
export type { SwappedIngredient } from "./solver";
// #21 portion adjust — realism clamp for relative portion bumps.
export { clampAdjustedGrams } from "./solver";
