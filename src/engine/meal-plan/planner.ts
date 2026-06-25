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
import { assembleMeal, isFibreCapableType } from "./solver";

// ── Day-level fibre target (#10) ─────────────────────────────────────────────
/**
 * Default fibre target: ≥10 g per 1000 kcal (the hard floor). It is no longer a
 * post-reconcile additive pass — it is allocated per slot (by kcal share) into
 * `SlotMacroTargets.fibreG` and solved JOINTLY by `assembleMeal` (a removable veg
 * filler bounded by kcal headroom). Parameterised via `config.fibreTargetPer1000`
 * so the upcoming #11 fibre-RESTRICTION protocol can later pass a lower value.
 */
const FIBRE_FLOOR_PER_1000 = 10;

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

  // Day fibre floor (default = 10 g/1000 kcal). NOT allocated per slot up front —
  // see the post-reconcile compensated deficit pass below, which tops up only the
  // shortfall (crediting every slot's intrinsic fibre) so we never over-provision.
  const fibrePer1000 = config.fibreTargetPer1000 ?? FIBRE_FLOOR_PER_1000;

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

  // 5. Reconcile the whole plan (calories → protein → fibre → carbs/fats). Carb
  //    and fibre fillers are sized JOINTLY inside assembleMeal during reconcile —
  //    bounded by each slot's kcal headroom — so there is NO additive post-pass.
  const reconciledSlots = reconcilePlan(initialSlots, config.macroTargets, {
    templates,
    validTypesPerSlot: slotValidTypes,
    excludeAllergens,
    preferTags,
  });

  // 6. Day fibre floor — a COMPENSATED top-up (re-solve, NOT an additive pass).
  //    We add only the day SHORTFALL (crediting every slot's intrinsic fibre, so
  //    we never over-provision), distributed across veg-capable slots by kcal
  //    share, by re-running assembleMeal with a per-slot fibre target. Because
  //    assembleMeal sizes the veg filler under each slot's kcal headroom and
  //    re-solves protein, the added fibre is kcal/protein-compensated — unlike
  //    the old additive fibre pass. Fibre yields to kcal: a slot with no headroom
  //    adds nothing, so the floor is met only WHEN the calorie budget allows.
  let fibreSlots = reconciledSlots;
  const floorG = (fibrePer1000 * config.macroTargets.totalKcal) / 1000;
  const dayFibreG = sumActualMacros(fibreSlots).fibreG ?? 0;
  if (floorG > 0 && dayFibreG < floorG) {
    const capableIdx = fibreSlots
      .map((s, i) => (isFibreCapableType(s.primary.template.mealType) ? i : -1))
      .filter((i) => i >= 0);
    const capableKcal = capableIdx.reduce((sum, i) => sum + fibreSlots[i]!.primary.actualMacros.kcal, 0);
    if (capableIdx.length > 0 && capableKcal > 0) {
      const deficit = floorG - dayFibreG;
      fibreSlots = fibreSlots.map((slot, i) => {
        if (!capableIdx.includes(i)) return slot;
        const share = deficit * (slot.primary.actualMacros.kcal / capableKcal);
        const slotFibre = slot.primary.actualMacros.fibreG ?? 0;
        const fibreTarget = { ...slot.targetMacros, fibreG: slotFibre + share };
        return { ...slot, primary: assembleMeal(slot.primary.template, fibreTarget) };
      });
    }
  }

  // 7. Substitutions against the final primaries (solved through the same path).
  const finalSlots: MealSlot[] = fibreSlots.map((slot, idx) => ({
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

  // Final totals + deviation + within-tolerance. Per spec §1, kcal is PRIMARY and
  // protein is PROTECTED; carbs/fats are the remainder and YIELD to them (a
  // low-carb day legitimately falls short on carbs). So `withinTolerance` reflects
  // ONLY the protected pair — kcal and protein — not the yielding remainder.
  const actualMacros = sumActualMacros(finalSlots);
  const deviation = calculateDeviation(actualMacros, config.macroTargets);
  const withinTolerance =
    Math.abs(deviation.kcal) <= tolerances.kcal &&
    Math.abs(deviation.proteinG) <= tolerances.proteinG;

  return {
    dayType: config.dayType,
    targetMacros: config.macroTargets,
    slots: finalSlots,
    actualMacros,
    deviation,
    withinTolerance,
  };
}
