/**
 * Types for the meal plan creator engine.
 * Handles meal structure, distribution, selection, scaling, and substitution.
 */

import type { DayType, MacroTargets } from "../types";

// ── Meal Classification ─────────────────────────────────────────────────────

export type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "pre_workout"
  | "post_workout";

/** Allergen categories for filtering */
export type Allergen =
  | "gluten"
  | "dairy"
  | "eggs"
  | "nuts"
  | "soy"
  | "fish"
  | "shellfish"
  | "sesame";

/** Diet/preference tags for filtering */
export type MealTag =
  | "high_protein"
  | "low_fat"
  | "low_carb"
  | "high_carb"
  | "vegetarian"
  | "vegan"
  | "quick_prep"
  | "meal_prep_friendly"
  | "italian"
  | "post_workout"
  | "pre_workout";

// ── Ingredient & Template ───────────────────────────────────────────────────

/** Single ingredient in a meal template */
export interface MealIngredient {
  /** Reference to food database ID */
  foodId: string;
  /** Display name */
  name: string;
  /** Amount in grams (base serving) */
  grams: number;
}

/** A meal template with base macros and ingredients */
export interface MealTemplate {
  /** Unique template ID (e.g., "BKFST_01", "MAIN_05") */
  id: string;
  /** Display name */
  name: string;
  /** Meal type classification */
  mealType: MealType;
  /** Description of the meal */
  description?: string;

  /** Macro profile per base serving */
  kcalPerServing: number;
  proteinG: number;
  carbsG: number;
  fatG: number;

  /** Ingredient list for scaling */
  ingredients: MealIngredient[];

  /** Tags for filtering/matching */
  tags: MealTag[];
  /** Allergens present in this meal */
  allergens: Allergen[];

  /** Whether this template is currently active */
  isActive: boolean;
}

// ── Distribution Templates ──────────────────────────────────────────────────

/** Fractional allocation of daily macros to each meal slot */
export interface SlotAllocation {
  /** Slot identifier (e.g., "breakfast", "lunch", "snack_1") */
  slot: string;
  /** Which meal types are valid for this slot */
  validTypes: MealType[];
  /** Fraction of daily kcal allocated (0-1, all slots sum to ~1.0) */
  kcalFraction: number;
  /** Fraction of daily protein allocated */
  proteinFraction: number;
  /** Fraction of daily fat allocated */
  fatFraction: number;
  /** Fraction of daily carbs allocated */
  carbsFraction: number;
}

/** A distribution template for N meals per day */
export interface DistributionTemplate {
  /** Number of meals (3-6) */
  mealCount: number;
  /** Label for this distribution */
  label: string;
  /** Slot allocations (length === mealCount) */
  slots: SlotAllocation[];
}

// ── Meal Slot (computed) ────────────────────────────────────────────────────

/** Macro targets for a single meal slot */
export interface SlotMacroTargets {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/** A selected meal for a slot, with scaling applied */
export interface SelectedMeal {
  /** The source template */
  template: MealTemplate;
  /** Scaling factor applied to ingredients (0.7-1.4) */
  scaleFactor: number;
  /** Scaled ingredients */
  scaledIngredients: MealIngredient[];
  /** Actual macros after scaling */
  actualMacros: SlotMacroTargets;
}

/** A complete meal slot in the plan */
export interface MealSlot {
  /** Slot identifier */
  slot: string;
  /** Target macros for this slot */
  targetMacros: SlotMacroTargets;
  /** Primary meal selection */
  primary: SelectedMeal;
  /** Alternative substitutions (2-4 options) */
  substitutions: SelectedMeal[];
}

// ── Tolerance Bands ─────────────────────────────────────────────────────────

/** Tolerance bands for macro matching */
export interface ToleranceBands {
  /** Protein tolerance in grams (default ±10g) */
  proteinG: number;
  /** Fat tolerance in grams (default ±10g) */
  fatG: number;
  /** Carb tolerance in grams (default ±15g) */
  carbsG: number;
  /** Energy tolerance in kcal (default ±100kcal) */
  kcal: number;
}

/** Default tolerance bands per spec */
export const DEFAULT_TOLERANCES: ToleranceBands = {
  proteinG: 10,
  fatG: 10,
  carbsG: 15,
  kcal: 100,
} as const;

// ── Scaling Bounds ──────────────────────────────────────────────────────────

/** Min/max scaling factor for ingredients */
export const SCALE_BOUNDS = {
  min: 0.7,
  max: 1.4,
} as const;

/** Min/max substitutions per slot */
export const SUBSTITUTION_BOUNDS = {
  min: 2,
  max: 4,
} as const;

// ── Plan Configuration ──────────────────────────────────────────────────────

/** Configuration for meal plan generation */
export interface MealPlanConfig {
  /** Day type for this plan */
  dayType: DayType;
  /** Daily macro targets (from engine) */
  macroTargets: MacroTargets;
  /** Number of meals per day (3-6, default 4) */
  mealCount?: number;
  /** Allergens to exclude */
  excludeAllergens?: Allergen[];
  /** Required tags (meals must have at least one) */
  preferTags?: MealTag[];
  /** Custom tolerance bands (defaults to DEFAULT_TOLERANCES) */
  tolerances?: Partial<ToleranceBands>;
  /** Custom distribution template (auto-selected if not provided) */
  distribution?: DistributionTemplate;
  /** Number of substitutions per slot (2-4, default 3) */
  substitutionsPerSlot?: number;
}

// ── Output ──────────────────────────────────────────────────────────────────

/** Macro deviation from target */
export interface MacroDeviation {
  proteinG: number;
  fatG: number;
  carbsG: number;
  kcal: number;
}

/** Complete meal plan for a single day */
export interface DayMealPlan {
  /** Day type */
  dayType: DayType;
  /** Target macros for the day */
  targetMacros: MacroTargets;
  /** Meal slots with selections */
  slots: MealSlot[];
  /** Actual total macros (sum of primary selections) */
  actualMacros: SlotMacroTargets;
  /** Deviation from target */
  deviation: MacroDeviation;
  /** Whether plan is within tolerance bands */
  withinTolerance: boolean;
}
