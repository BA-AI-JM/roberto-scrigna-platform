/**
 * Main meal plan creator — Stage 2 (per-ingredient gram solving).
 *
 * Pipeline:
 * 1. Determine meal structure (3-6 meals) from config / distribution.
 * 2. Allocate per-slot macro targets from the daily prescription.
 * 3. Select a starting template per slot (allergen/tag/type filtered).
 * 4. Solve per-ingredient grams to the slot target (`assembleMeal`).
 * 5. Reconcile the whole plan (coordinate descent over templates + gram solve)
 *    under priority calories → protein → fibre → carbs/fats.
 * 6. Conditional fillers: top up carbs per slot and the day-level fibre floor
 *    (≥10 g / 1000 kcal) when intrinsic ingredients can't reach them.
 * 7. Generate substitutions through the same solver.
 *
 * The old single-scale-factor mechanism, fat-compensation, and the whole-meal
 * `tightenPlan` rescale are gone — calories are handled directly by the solver
 * objective, and fat is set by fat-source grams.
 */

import type { MacroTargets } from "../types";
import type {
  DayMealPlan,
  MealPlanConfig,
  MealSlot,
  MealTemplate,
  MealType,
  MacroDeviation,
  SlotMacroTargets,
  ToleranceBands,
} from "./types";
import { DEFAULT_TOLERANCES, SUBSTITUTION_BOUNDS } from "./types";
import { getDistribution } from "./distribution";
import { selectMeals, type SelectionFilter } from "./selector";
import { generateSubstitutions } from "./substitution";
import { reconcilePlan } from "./reconcile";
import { assembleMeal, remeasure, topUpCarb, topUpFibre } from "./solver";

// ── Day-level fibre floor (#10) ──────────────────────────────────────────────
/** Hard floor: ≥10 g fibre per 1000 kcal. Target when filling: 15 g/1000 kcal. */
const FIBRE_FLOOR_PER_1000 = 10;
const FIBRE_TARGET_PER_1000 = 15;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert distribution fractions to absolute macro targets for a slot. */
function allocateSlotMacros(
  dailyMacros: MacroTargets,
  fractions: { kcalFraction: number; proteinFraction: number; fatFraction: number; carbsFraction: number }
): SlotMacroTargets {
  return {
    kcal: Math.round(dailyMacros.totalKcal * fractions.kcalFraction),
    proteinG: Math.round(dailyMacros.proteinG * fractions.proteinFraction * 10) / 10,
    fatG: Math.round(dailyMacros.fatG * fractions.fatFraction * 10) / 10,
    carbsG: Math.round(dailyMacros.carbG * fractions.carbsFraction * 10) / 10,
  };
}

/** Sum primary macros across slots (incl fibre/sodium). */
function sumActualMacros(slots: MealSlot[]): SlotMacroTargets {
  const acc = slots.reduce(
    (sum, slot) => {
      const a = slot.primary.actualMacros;
      return {
        kcal: sum.kcal + a.kcal,
        proteinG: sum.proteinG + a.proteinG,
        fatG: sum.fatG + a.fatG,
        carbsG: sum.carbsG + a.carbsG,
        fibreG: sum.fibreG + (a.fibreG ?? 0),
        sodiumMg: sum.sodiumMg + (a.sodiumMg ?? 0),
      };
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fibreG: 0, sodiumMg: 0 }
  );
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    kcal: Math.round(acc.kcal),
    proteinG: r1(acc.proteinG),
    fatG: r1(acc.fatG),
    carbsG: r1(acc.carbsG),
    fibreG: r1(acc.fibreG),
    sodiumMg: Math.round(acc.sodiumMg),
  };
}

function calculateDeviation(actual: SlotMacroTargets, target: MacroTargets): MacroDeviation {
  return {
    proteinG: Math.round((actual.proteinG - target.proteinG) * 10) / 10,
    fatG: Math.round((actual.fatG - target.fatG) * 10) / 10,
    carbsG: Math.round((actual.carbsG - target.carbG) * 10) / 10,
    kcal: actual.kcal - target.totalKcal,
  };
}

function isWithinTolerance(deviation: MacroDeviation, tolerances: ToleranceBands): boolean {
  return (
    Math.abs(deviation.proteinG) <= tolerances.proteinG &&
    Math.abs(deviation.fatG) <= tolerances.fatG &&
    Math.abs(deviation.carbsG) <= tolerances.carbsG &&
    Math.abs(deviation.kcal) <= tolerances.kcal
  );
}

// ── Main API ────────────────────────────────────────────────────────────────

/**
 * Generate a complete day meal plan.
 */
export function createMealPlan(
  templates: MealTemplate[],
  config: MealPlanConfig
): DayMealPlan {
  const mealCount = config.mealCount ?? 4;
  const excludeAllergens = config.excludeAllergens ?? [];
  const preferTags = config.preferTags ?? [];
  const tolerances: ToleranceBands = { ...DEFAULT_TOLERANCES, ...config.tolerances };
  const subsCount = Math.max(
    SUBSTITUTION_BOUNDS.min,
    Math.min(SUBSTITUTION_BOUNDS.max, config.substitutionsPerSlot ?? 3)
  );

  // 1-2. Distribution → per-slot macro targets.
  const distribution = config.distribution ?? getDistribution(mealCount);
  const slotTargets = distribution.slots.map((slot) => allocateSlotMacros(config.macroTargets, slot));
  const slotValidTypes: MealType[][] = distribution.slots.map((s) => s.validTypes);

  // 3-4. Pick a starting template per slot and solve its ingredient grams.
  const usedIds: string[] = [];
  const initialSlots: MealSlot[] = distribution.slots.map((distSlot, idx) => {
    const target = slotTargets[idx]!;
    const filter: SelectionFilter = {
      validTypes: distSlot.validTypes,
      excludeAllergens,
      preferTags,
      excludeIds: [...usedIds],
    };
    const selected = selectMeals(templates, target, filter, 1);
    const bestTemplate =
      selected[0]?.template ??
      templates.find((t) => t.isActive && distSlot.validTypes.includes(t.mealType));
    if (!bestTemplate) {
      throw new Error(
        `No valid meal template found for slot "${distSlot.slot}" with types [${distSlot.validTypes.join(", ")}]`
      );
    }
    usedIds.push(bestTemplate.id);
    return {
      slot: distSlot.slot,
      targetMacros: target,
      primary: assembleMeal(bestTemplate, target),
      substitutions: [],
    };
  });

  // 5. Reconcile the whole plan (calories → protein → fibre → carbs/fats).
  const reconciledSlots = reconcilePlan(initialSlots, config.macroTargets, {
    templates,
    validTypesPerSlot: slotValidTypes,
    excludeAllergens,
    preferTags,
  });

  // 6a. Per-slot carb top-up — fillers only where intrinsic carbs fall short.
  let filledSlots: MealSlot[] = reconciledSlots.map((slot) => {
    const { ingredients, added } = topUpCarb(
      slot.primary.scaledIngredients,
      slot.primary.template.mealType,
      slot.targetMacros.carbsG
    );
    if (!added) return slot;
    return { ...slot, primary: remeasure({ ...slot.primary, scaledIngredients: ingredients }) };
  });

  // 6b. Day-level fibre floor: if the day is short, add one fibre filler.
  const dayKcal = sumActualMacros(filledSlots).kcal;
  const floor = (FIBRE_FLOOR_PER_1000 * dayKcal) / 1000;
  const dayFibre = sumActualMacros(filledSlots).fibreG ?? 0;
  if (dayKcal > 0 && dayFibre < floor) {
    const needed = (FIBRE_TARGET_PER_1000 * dayKcal) / 1000 - dayFibre;
    // Prefer a lunch/dinner slot (veg filler); else the first slot.
    const targetIdx = (() => {
      const main = filledSlots.findIndex(
        (s) => s.primary.template.mealType === "lunch" || s.primary.template.mealType === "dinner"
      );
      return main !== -1 ? main : 0;
    })();
    const slot = filledSlots[targetIdx];
    if (slot) {
      const { ingredients, added } = topUpFibre(
        slot.primary.scaledIngredients,
        slot.primary.template.mealType,
        needed
      );
      if (added) {
        filledSlots = filledSlots.map((s, i) =>
          i === targetIdx ? { ...s, primary: remeasure({ ...s.primary, scaledIngredients: ingredients }) } : s
        );
      }
    }
  }

  // 7. Substitutions against the final primaries.
  const finalSlots: MealSlot[] = filledSlots.map((slot, idx) => ({
    ...slot,
    substitutions: generateSubstitutions({
      templates,
      primaryId: slot.primary.template.id,
      target: slot.targetMacros,
      validTypes: slotValidTypes[idx] ?? [slot.primary.template.mealType],
      excludeAllergens,
      preferTags,
      count: subsCount,
    }),
  }));

  // Final totals + deviation + within-tolerance (incl fibre floor).
  const actualMacros = sumActualMacros(finalSlots);
  const deviation = calculateDeviation(actualMacros, config.macroTargets);
  const fibreFloorMet = (actualMacros.fibreG ?? 0) >= (FIBRE_FLOOR_PER_1000 * actualMacros.kcal) / 1000;
  const withinTolerance = isWithinTolerance(deviation, tolerances) && fibreFloorMet;

  return {
    dayType: config.dayType,
    targetMacros: config.macroTargets,
    slots: finalSlots,
    actualMacros,
    deviation,
    withinTolerance,
  };
}
