/**
 * Ingredient scaling engine.
 * Scales meal ingredients within 0.7-1.4x to match slot macro targets.
 */

import type {
  MealIngredient,
  MealTemplate,
  SelectedMeal,
  SlotMacroTargets,
} from "./types";
import { SCALE_BOUNDS } from "./types";

/**
 * Calculate the optimal scale factor to best match target macros.
 * Uses a weighted average of per-macro scale factors, clamped to [0.7, 1.4].
 */
export function calculateScaleFactor(
  template: MealTemplate,
  target: SlotMacroTargets
): number {
  // Calculate ideal scale factor per macro dimension
  const scales: { factor: number; weight: number }[] = [];

  if (template.kcalPerServing > 0 && target.kcal > 0) {
    scales.push({
      factor: target.kcal / template.kcalPerServing,
      weight: 0.25,
    });
  }
  if (template.proteinG > 0 && target.proteinG > 0) {
    scales.push({
      factor: target.proteinG / template.proteinG,
      weight: 0.35,
    });
  }
  if (template.fatG > 0 && target.fatG > 0) {
    scales.push({ factor: target.fatG / template.fatG, weight: 0.2 });
  }
  if (template.carbsG > 0 && target.carbsG > 0) {
    scales.push({ factor: target.carbsG / template.carbsG, weight: 0.2 });
  }

  if (scales.length === 0) return 1.0;

  // Weighted average
  const totalWeight = scales.reduce((sum, s) => sum + s.weight, 0);
  const weightedScale =
    scales.reduce((sum, s) => sum + s.factor * s.weight, 0) / totalWeight;

  // Clamp to bounds
  return Math.max(SCALE_BOUNDS.min, Math.min(SCALE_BOUNDS.max, weightedScale));
}

/**
 * Scale ingredients by the given factor.
 * Returns new ingredient objects with adjusted grams (rounded to nearest gram).
 */
export function scaleIngredients(
  ingredients: MealIngredient[],
  factor: number
): MealIngredient[] {
  return ingredients.map((ing) => ({
    ...ing,
    grams: Math.round(ing.grams * factor),
  }));
}

/**
 * Calculate actual macros after scaling a template.
 */
export function scaledMacros(
  template: MealTemplate,
  factor: number
): SlotMacroTargets {
  return {
    kcal: Math.round(template.kcalPerServing * factor),
    proteinG: Math.round(template.proteinG * factor * 10) / 10,
    fatG: Math.round(template.fatG * factor * 10) / 10,
    carbsG: Math.round(template.carbsG * factor * 10) / 10,
  };
}

/**
 * Create a SelectedMeal by scaling a template to match target macros.
 */
export function scaleMealToTarget(
  template: MealTemplate,
  target: SlotMacroTargets
): SelectedMeal {
  const scaleFactor = calculateScaleFactor(template, target);
  const scaledIngs = scaleIngredients(template.ingredients, scaleFactor);
  const actualMacros = scaledMacros(template, scaleFactor);

  return {
    template,
    scaleFactor,
    scaledIngredients: scaledIngs,
    actualMacros,
  };
}
