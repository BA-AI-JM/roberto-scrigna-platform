/**
 * Main meal plan creator.
 *
 * Orchestrates the full meal plan generation pipeline:
 * 1. Determine meal structure (3-6 meals) from config
 * 2. Allocate per-meal macros via distribution templates
 * 3. Select best-matching ExampleMeals (filter allergens/tags)
 * 4. Scale ingredients (0.7-1.4x)
 * 5. Generate substitutions (2-4 per slot)
 * 6. Apply fat compensation rules
 * 7. Tighten to targets within tolerance bands
 */

import type { MacroTargets } from "../types";
import type {
  Allergen,
  DayMealPlan,
  MealPlanConfig,
  MealSlot,
  MealTag,
  MealTemplate,
  MealType,
  MacroDeviation,
  SlotMacroTargets,
  ToleranceBands,
} from "./types";
import { DEFAULT_TOLERANCES, SUBSTITUTION_BOUNDS } from "./types";
import { getDistribution } from "./distribution";
import { selectMeals, type SelectionFilter } from "./selector";
import { scaleMealToTarget } from "./scaler";
import { generateSubstitutions } from "./substitution";
import { applyFatCompensation } from "./fat-compensation";
import { reconcilePlan } from "./reconcile";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert distribution fractions to absolute macro targets for a slot.
 */
function allocateSlotMacros(
  dailyMacros: MacroTargets,
  fractions: {
    kcalFraction: number;
    proteinFraction: number;
    fatFraction: number;
    carbsFraction: number;
  }
): SlotMacroTargets {
  return {
    kcal: Math.round(dailyMacros.totalKcal * fractions.kcalFraction),
    proteinG:
      Math.round(dailyMacros.proteinG * fractions.proteinFraction * 10) / 10,
    fatG: Math.round(dailyMacros.fatG * fractions.fatFraction * 10) / 10,
    carbsG: Math.round(dailyMacros.carbG * fractions.carbsFraction * 10) / 10,
  };
}

/**
 * Sum macros across all primary meal selections.
 */
function sumActualMacros(slots: MealSlot[]): SlotMacroTargets {
  return slots.reduce(
    (sum, slot) => ({
      kcal: sum.kcal + slot.primary.actualMacros.kcal,
      proteinG:
        Math.round((sum.proteinG + slot.primary.actualMacros.proteinG) * 10) /
        10,
      fatG:
        Math.round((sum.fatG + slot.primary.actualMacros.fatG) * 10) / 10,
      carbsG:
        Math.round((sum.carbsG + slot.primary.actualMacros.carbsG) * 10) / 10,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }
  );
}

/**
 * Calculate deviation between actual and target macros.
 */
function calculateDeviation(
  actual: SlotMacroTargets,
  target: MacroTargets
): MacroDeviation {
  return {
    proteinG: Math.round((actual.proteinG - target.proteinG) * 10) / 10,
    fatG: Math.round((actual.fatG - target.fatG) * 10) / 10,
    carbsG: Math.round((actual.carbsG - target.carbG) * 10) / 10,
    kcal: actual.kcal - target.totalKcal,
  };
}

/**
 * Check if deviation is within tolerance bands.
 */
function isWithinTolerance(
  deviation: MacroDeviation,
  tolerances: ToleranceBands
): boolean {
  return (
    Math.abs(deviation.proteinG) <= tolerances.proteinG &&
    Math.abs(deviation.fatG) <= tolerances.fatG &&
    Math.abs(deviation.carbsG) <= tolerances.carbsG &&
    Math.abs(deviation.kcal) <= tolerances.kcal
  );
}

/**
 * Tighten plan to fit within tolerance bands.
 * Adjusts the last slot's selection to absorb remaining deviation.
 * Makes up to 3 passes of adjustment.
 */
function tightenPlan(
  slots: MealSlot[],
  dailyMacros: MacroTargets,
  templates: MealTemplate[],
  filter: Omit<SelectionFilter, "validTypes" | "excludeIds">,
  tolerances: ToleranceBands
): MealSlot[] {
  const result = [...slots];
  const MAX_PASSES = 3;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const actual = sumActualMacros(result);
    const deviation = calculateDeviation(actual, dailyMacros);

    if (isWithinTolerance(deviation, tolerances)) break;

    // Find the slot with the largest absolute deviation contribution
    // and try re-selecting for that slot with adjusted targets
    const lastIdx = result.length - 1;
    const lastSlot = result[lastIdx]!;

    // Adjust the last slot's target to absorb the remaining deviation
    const adjustedTarget: SlotMacroTargets = {
      kcal: Math.max(50, lastSlot.targetMacros.kcal - deviation.kcal),
      proteinG: Math.max(
        5,
        lastSlot.targetMacros.proteinG - deviation.proteinG
      ),
      fatG: Math.max(3, lastSlot.targetMacros.fatG - deviation.fatG),
      carbsG: Math.max(5, lastSlot.targetMacros.carbsG - deviation.carbsG),
    };

    // Get the valid types for this slot from the currently selected primary
    // template. MealSlot does not carry the original distribution's validTypes,
    // so constraining re-selection to the same type as the current primary is
    // the safest fallback that keeps meal-type integrity across tighten passes.
    const validTypes: MealType[] = [slots[lastIdx]!.primary.template.mealType];

    // Re-select and scale for this adjusted target
    const usedIds = result
      .filter((_, idx) => idx !== lastIdx)
      .map((s) => s.primary.template.id);

    const reselected = selectMeals(
      templates,
      adjustedTarget,
      {
        ...filter,
        validTypes,
        excludeIds: usedIds,
      },
      1
    );

    if (reselected.length > 0) {
      const newPrimary = scaleMealToTarget(
        reselected[0]!.template,
        adjustedTarget
      );
      result[lastIdx] = {
        ...lastSlot,
        targetMacros: adjustedTarget,
        primary: newPrimary,
      };
    }
  }

  return result;
}

// ── Main API ────────────────────────────────────────────────────────────────

/**
 * Generate a complete day meal plan.
 *
 * @param templates - Available meal templates
 * @param config - Plan configuration (day type, macro targets, preferences)
 * @returns Complete day meal plan with primary selections and substitutions
 */
export function createMealPlan(
  templates: MealTemplate[],
  config: MealPlanConfig
): DayMealPlan {
  const mealCount = config.mealCount ?? 4;
  const excludeAllergens = config.excludeAllergens ?? [];
  const preferTags = config.preferTags ?? [];
  const tolerances: ToleranceBands = {
    ...DEFAULT_TOLERANCES,
    ...config.tolerances,
  };
  const subsCount = Math.max(
    SUBSTITUTION_BOUNDS.min,
    Math.min(SUBSTITUTION_BOUNDS.max, config.substitutionsPerSlot ?? 3)
  );

  // #18: on non-training day-types (rest / refeed / deload) drop post-workout-
  // tagged meals from the pool, so a "post-workout" item (e.g. the protein
  // shake) never lands on a rest day. Every selection path below — primary,
  // tighten, reconcile, substitutions — draws from `pool`, so the dedicated
  // post_workout slot (6-meal distribution) fills with a normal snack instead.
  // Training days are unaffected.
  const pool =
    config.dayType === "training"
      ? templates
      : templates.filter((t) => !t.tags.includes("post_workout"));

  // 1. Get distribution template
  const distribution = config.distribution ?? getDistribution(mealCount);

  // 2. Allocate per-slot macros
  const slotTargets = distribution.slots.map((slot) =>
    allocateSlotMacros(config.macroTargets, slot)
  );

  // Valid meal types per slot index — needed by both substitution generation
  // and the reconciliation pass, neither of which can recover it from MealSlot.
  const slotValidTypes: MealType[][] = distribution.slots.map(
    (s) => s.validTypes
  );

  // 3. Select primary meals for each slot. Substitutions are generated later,
  //    after fat-compensation / tighten / reconcile have settled the primaries,
  //    so the alternatives match the FINAL primary and target (not a stale one).
  const usedIds: string[] = [];
  const initialSlots: MealSlot[] = distribution.slots.map((distSlot, idx) => {
    const target = slotTargets[idx]!;

    const filter: SelectionFilter = {
      validTypes: distSlot.validTypes,
      excludeAllergens,
      preferTags,
      excludeIds: [...usedIds],
    };

    const selected = selectMeals(pool, target, filter, 1);

    // Fallback: if no candidates, use the first active template of valid type
    const bestTemplate =
      selected[0]?.template ??
      pool.find(
        (t) => t.isActive && distSlot.validTypes.includes(t.mealType)
      );

    if (!bestTemplate) {
      throw new Error(
        `No valid meal template found for slot "${distSlot.slot}" with types [${distSlot.validTypes.join(", ")}]`
      );
    }

    usedIds.push(bestTemplate.id);

    // 4. Scale to match target
    const primary = scaleMealToTarget(bestTemplate, target);

    return {
      slot: distSlot.slot,
      targetMacros: target,
      primary,
      substitutions: [],
    };
  });

  // 5. Apply fat compensation
  const { adjustedTargets } = applyFatCompensation(initialSlots);
  const compensatedSlots = initialSlots.map((slot, idx) => {
    const newTarget = adjustedTargets[idx]!;
    // Only rescale if target changed significantly
    if (
      Math.abs(newTarget.fatG - slot.targetMacros.fatG) > 2 ||
      Math.abs(newTarget.carbsG - slot.targetMacros.carbsG) > 2
    ) {
      return {
        ...slot,
        targetMacros: newTarget,
        primary: scaleMealToTarget(slot.primary.template, newTarget),
      };
    }
    return slot;
  });

  // 6. Tighten the last slot to tolerance bands (cheap local correction)
  const baseFilter: Omit<SelectionFilter, "validTypes" | "excludeIds"> = {
    excludeAllergens,
    preferTags,
  };
  const tightenedSlots = tightenPlan(
    compensatedSlots,
    config.macroTargets,
    pool,
    baseFilter,
    tolerances
  );

  // 7. Reconcile the whole plan so the SUM of delivered macros matches the
  //    prescription within tolerance (#21). Re-selects template + scale factor
  //    per slot, staying inside SCALE_BOUNDS.
  const reconciledSlots = reconcilePlan(tightenedSlots, config.macroTargets, {
    templates: pool,
    validTypesPerSlot: slotValidTypes,
    excludeAllergens,
    preferTags,
  });

  // 8. Generate substitutions against the FINAL primaries.
  const finalSlots: MealSlot[] = reconciledSlots.map((slot, idx) => ({
    ...slot,
    substitutions: generateSubstitutions({
      templates: pool,
      primaryId: slot.primary.template.id,
      target: slot.targetMacros,
      validTypes: slotValidTypes[idx] ?? [slot.primary.template.mealType],
      excludeAllergens,
      preferTags,
      count: subsCount,
    }),
  }));

  // 9. Calculate final totals
  const actualMacros = sumActualMacros(finalSlots);
  const deviation = calculateDeviation(actualMacros, config.macroTargets);
  const withinTolerance = isWithinTolerance(deviation, tolerances);

  return {
    dayType: config.dayType,
    targetMacros: config.macroTargets,
    slots: finalSlots,
    actualMacros,
    deviation,
    withinTolerance,
  };
}
