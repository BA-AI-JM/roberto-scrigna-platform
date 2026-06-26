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
  /**
   * Dietary fibre (g). Optional: slot *targets* don't set it (fibre is a
   * day-level floor), but `actualMacros` carries it once computed from solved
   * ingredient grams (Stage 2).
   */
  fibreG?: number;
  /** Sodium (mg). Optional, same as fibreG — computed, not constrained yet. */
  sodiumMg?: number;
}

/** A selected meal for a slot, with per-ingredient grams solved (Stage 2). */
export interface SelectedMeal {
  /** The source template */
  template: MealTemplate;
  /**
   * Legacy whole-meal scale factor. OPTIONAL and left UNPOPULATED by the
   * Stage-2 per-ingredient solver; retained only so old persisted bundles
   * (which carry it) still type-check and render.
   */
  scaleFactor?: number;
  /** Solved ingredient grams */
  scaledIngredients: MealIngredient[];
  /** Actual macros computed from the solved ingredient grams (incl fibre/sodium) */
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

/** Default per-day tolerance bands (v4.4 spec §10.8.3). */
export const DEFAULT_TOLERANCES: ToleranceBands = {
  proteinG: 10,
  fatG: 10,
  carbsG: 15,
  kcal: 100,
} as const;

/** Per-meal tolerance bands (v4.4 spec §10.8.3). Tighter than per-day. */
export const PER_MEAL_TOLERANCES: ToleranceBands = {
  proteinG: 5,
  fatG: 5,
  carbsG: 10,
  kcal: 50,
} as const;

/**
 * Macro deviation for a single slot's actual vs target.
 * Helper for UI / validator code; not stored on the slot.
 */
export interface SlotDeviation {
  proteinG: number;
  fatG: number;
  carbsG: number;
  kcal: number;
}

/**
 * Compute the deviation between a slot's actual macros and its target macros.
 * Positive values indicate "over target".
 */
export function computeSlotDeviation(
  actual: SlotMacroTargets,
  target: SlotMacroTargets
): SlotDeviation {
  return {
    proteinG: Math.round((actual.proteinG - target.proteinG) * 10) / 10,
    fatG: Math.round((actual.fatG - target.fatG) * 10) / 10,
    carbsG: Math.round((actual.carbsG - target.carbsG) * 10) / 10,
    kcal: actual.kcal - target.kcal,
  };
}

/** Check whether a deviation is within the provided tolerance bands. */
export function withinTolerance(
  deviation: SlotDeviation,
  tolerances: ToleranceBands = PER_MEAL_TOLERANCES
): boolean {
  return (
    Math.abs(deviation.proteinG) <= tolerances.proteinG &&
    Math.abs(deviation.fatG) <= tolerances.fatG &&
    Math.abs(deviation.carbsG) <= tolerances.carbsG &&
    Math.abs(deviation.kcal) <= tolerances.kcal
  );
}

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
  /**
   * Day fibre target in grams per 1000 kcal. Defaults to 10 (the floor). Solved
   * jointly (removable veg filler under kcal headroom), never bolted on.
   */
  fibreTargetPer1000?: number;
  /**
   * Fibre direction (#11). "floor" (default) = reach ≥ fibreTargetPer1000 g/1000
   * kcal via the compensated deficit pass. "cap" = combat-sport fibre RESTRICTION:
   * keep day fibre ≤ `fibreCapG` by biasing reconcile toward low-fibre templates
   * and skipping the fibre-add pass. Both protect kcal+protein.
   */
  fibreMode?: "floor" | "cap";
  /** Absolute day fibre cap (g) when fibreMode==="cap". Defaults to FIBRE_RESTRICTION_CAP_G. */
  fibreCapG?: number;
  /**
   * Combat-sport sodium RESTRICTION (#11): when set, reconcile biases toward
   * low-sodium templates to keep summed day sodium ≤ this cap (mg), while
   * protecting kcal+protein (sodium yields below them). Off when undefined.
   */
  sodiumCapMg?: number;
  /**
   * Coach source pins (#16b) — force which food fills a category, per day-type
   * (e.g. PROTEIN → cottage cheese). Opt-in; absent = free selection (unchanged).
   * Applied in assembleMeal: the pinned food replaces the category's template
   * ingredient and the solver recomputes grams. A pin changes WHICH food fills a
   * category, not the macro targets.
   */
  sourcePins?: Partial<Record<DayType, SourcePin>>;
}

// ── Source pins (#16b) ────────────────────────────────────────────────────────
/** Categories a coach may pin a source for (FIXED — water/spices — is excluded). */
export type PinnableCategory = "PROTEIN" | "CARB" | "VEG" | "FAT" | "FRUIT";
/** Per-category forced food source for one day-type. */
export type SourcePin = Partial<Record<PinnableCategory, { foodId: string }>>;

// ── Combat-sport restriction caps (#11) ──────────────────────────────────────
/** Day fibre cap (g) for the fibre-restriction protocol (target < 10 g/day). */
export const FIBRE_RESTRICTION_CAP_G = 9;
/** Day sodium cap (mg) for the sodium-restriction protocol (target < 500 mg/day). */
export const SODIUM_RESTRICTION_CAP_MG = 500;

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
