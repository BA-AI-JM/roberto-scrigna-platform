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
  ToleranceBands,
  MealPlanConfig,
  MacroDeviation,
  DayMealPlan,
} from "./types";

export { DEFAULT_TOLERANCES, SCALE_BOUNDS, SUBSTITUTION_BOUNDS } from "./types";

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
