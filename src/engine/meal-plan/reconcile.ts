/**
 * Whole-plan macro reconciliation (#21).
 *
 * Roberto reported delivered macros diverging from the prescription (he saw
 * ~165 g protein prescribed vs a much larger generated total). The per-slot
 * pipeline — select → ONE weighted-average scale factor per meal (clamped to
 * [0.7, 1.4]) → fat-compensate → tighten only the last slot — never reconciles
 * the SUM of all meals back to the daily target. Because every template is
 * protein-dense (main meals carry carb:protein ≈ 1.3) a single factor per meal
 * cannot decouple the macros, so carbohydrate falls short while protein/fat run
 * over and nothing corrects the daily totals.
 *
 * This pass re-optimises the whole plan with coordinate descent: each pass, for
 * each slot, it re-selects the template + scale factor that drives the SUM of
 * all primary selections closest to the prescription. It stays inside the
 * existing [0.7, 1.4] scale bounds (portions remain weighable, and existing
 * scale-factor invariants hold) and preserves meal-type and allergen filters.
 *
 * It cannot beat the template pool. A prescription that demands more
 * carbohydrate than the (uniformly protein-dense) templates can carry at 1.4×
 * stays short — closing that residual needs carb-dense filler foods or
 * per-ingredient macros (see CORRECTIONS-TRIAGE.md #10). Within the achievable
 * envelope it lands all three macros within RECONCILE_TOLERANCE_PCT.
 */

import type { MacroTargets } from "../types";
import type {
  Allergen,
  MealSlot,
  MealTag,
  MealTemplate,
  MealType,
  SelectedMeal,
  SlotMacroTargets,
} from "./types";
import { SCALE_BOUNDS } from "./types";
import { scaleIngredients, scaledMacros } from "./scaler";
import { filterMeals } from "./selector";

/**
 * Acceptable proportional drift between summed delivered macros and the daily
 * prescription, per macro (P/F/C). A single documented knob.
 *
 * Tolerance pending Roberto sign-off (#21)
 */
export const RECONCILE_TOLERANCE_PCT = 5;

/** Scale-factor granularity for the search. Stays within SCALE_BOUNDS. */
const FACTOR_STEP = 0.025;

/** Default coordinate-descent passes; converges well before this in practice. */
const DEFAULT_MAX_PASSES = 12;

export interface ReconcileContext {
  /** Full template pool. */
  templates: MealTemplate[];
  /** Valid meal types for each slot index (from the distribution template). */
  validTypesPerSlot: MealType[][];
  /** Allergens to exclude (kept consistent with primary selection). */
  excludeAllergens: Allergen[];
  /** Preferred tags. */
  preferTags: MealTag[];
  /** Per-macro proportional tolerance; defaults to RECONCILE_TOLERANCE_PCT. */
  tolerancePct?: number;
  /** Max coordinate-descent passes; defaults to DEFAULT_MAX_PASSES. */
  maxPasses?: number;
}

const ZERO: SlotMacroTargets = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };

function addMacros(a: SlotMacroTargets, b: SlotMacroTargets): SlotMacroTargets {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    fatG: a.fatG + b.fatG,
    carbsG: a.carbsG + b.carbsG,
  };
}

/** Sum of every slot's primary actualMacros, optionally skipping one index. */
function sumPrimaries(slots: MealSlot[], skipIdx = -1): SlotMacroTargets {
  return slots.reduce(
    (sum, slot, idx) =>
      idx === skipIdx ? sum : addMacros(sum, slot.primary.actualMacros),
    { ...ZERO }
  );
}

/**
 * Proportional error of summed macros vs the daily prescription.
 * `maxPct` is the binding per-macro deviation (matches the regression test);
 * `score` adds a squared-sum tie-breaker so the search prefers all-round fits.
 */
function proportionalError(
  actual: SlotMacroTargets,
  target: MacroTargets
): { maxPct: number; score: number } {
  const dev = (a: number, t: number) =>
    t > 0 ? Math.abs(a - t) / t : a === 0 ? 0 : 1;
  const eP = dev(actual.proteinG, target.proteinG);
  const eF = dev(actual.fatG, target.fatG);
  const eC = dev(actual.carbsG, target.carbG);
  const max = Math.max(eP, eF, eC);
  return { maxPct: max * 100, score: max * 1000 + (eP * eP + eF * eF + eC * eC) };
}

function buildSelected(template: MealTemplate, factor: number): SelectedMeal {
  return {
    template,
    scaleFactor: factor,
    scaledIngredients: scaleIngredients(template.ingredients, factor),
    actualMacros: scaledMacros(template, factor),
  };
}

/** Candidate scale factors across the existing [0.7, 1.4] bounds (inclusive). */
function buildFactorGrid(): number[] {
  const grid: number[] = [];
  for (
    let f = SCALE_BOUNDS.min;
    f <= SCALE_BOUNDS.max + 1e-9;
    f += FACTOR_STEP
  ) {
    grid.push(Math.round(f * 1000) / 1000);
  }
  return grid;
}

const FACTOR_GRID = buildFactorGrid();

/**
 * Reconcile a plan's primary selections so their summed macros approach the
 * daily prescription. Returns a new slot array (substitutions untouched — the
 * caller regenerates them against the final primaries).
 */
export function reconcilePlan(
  slots: MealSlot[],
  dailyMacros: MacroTargets,
  ctx: ReconcileContext
): MealSlot[] {
  const tol = ctx.tolerancePct ?? RECONCILE_TOLERANCE_PCT;
  const maxPasses = ctx.maxPasses ?? DEFAULT_MAX_PASSES;

  let work = slots.map((s) => ({ ...s }));
  let best = work.map((s) => ({ ...s }));
  let bestScore = proportionalError(sumPrimaries(work), dailyMacros).score;

  for (let pass = 0; pass < maxPasses; pass++) {
    if (proportionalError(sumPrimaries(work), dailyMacros).maxPct <= tol) break;

    let improved = false;

    for (let i = 0; i < work.length; i++) {
      const validTypes = ctx.validTypesPerSlot[i] ?? [
        work[i]!.primary.template.mealType,
      ];
      const usedByOthers = work
        .filter((_, j) => j !== i)
        .map((s) => s.primary.template.id);

      const candidates = filterMeals(ctx.templates, {
        validTypes,
        excludeAllergens: ctx.excludeAllergens,
        preferTags: ctx.preferTags,
        excludeIds: usedByOthers,
      });
      if (candidates.length === 0) continue;

      const others = sumPrimaries(work, i);
      let localBestScore = proportionalError(
        addMacros(others, work[i]!.primary.actualMacros),
        dailyMacros
      ).score;
      let pick: { template: MealTemplate; factor: number } | null = null;

      for (const template of candidates) {
        for (const factor of FACTOR_GRID) {
          const total = addMacros(others, scaledMacros(template, factor));
          const score = proportionalError(total, dailyMacros).score;
          if (score < localBestScore - 1e-9) {
            localBestScore = score;
            pick = { template, factor };
          }
        }
      }

      if (pick) {
        work[i] = {
          ...work[i]!,
          primary: buildSelected(pick.template, pick.factor),
        };
        improved = true;
      }
    }

    const score = proportionalError(sumPrimaries(work), dailyMacros).score;
    if (score < bestScore) {
      bestScore = score;
      best = work.map((s) => ({ ...s }));
    }
    if (!improved) break;
  }

  return best;
}
