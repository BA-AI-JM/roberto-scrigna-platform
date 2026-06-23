/**
 * Whole-plan macro reconciliation (#21) — Stage 2, per-ingredient.
 *
 * Coordinate descent over slots: each pass, for each slot, try every candidate
 * template, run the per-ingredient gram solver (`assembleMeal`) to the slot
 * target, and keep the (template, solved-grams) that drives the SUM of all
 * primaries closest to the daily prescription under the STRICT priority:
 *   1. calories (summed from v3 Calories, NOT 4P+4C+9F)
 *   2. protein (protected)
 *   3. day-level fibre floor (prefer fibrous picks; the planner enforces the
 *      hard floor with fillers after reconcile)
 *   4. carbs / fats (remainder)
 *
 * Replaces the old single-scale-factor + FACTOR_GRID search.
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
import { assembleMeal } from "./solver";
import { filterMeals } from "./selector";

/** Per-macro proportional tolerance for the convergence check (kcal+protein). */
export const RECONCILE_TOLERANCE_PCT = 5;

/** Fibre floor used to bias selection (g per 1000 kcal). Hard floor enforced by planner. */
const FIBRE_FLOOR_PER_1000 = 10;

const DEFAULT_MAX_PASSES = 12;

export interface ReconcileContext {
  templates: MealTemplate[];
  validTypesPerSlot: MealType[][];
  excludeAllergens: Allergen[];
  preferTags: MealTag[];
  tolerancePct?: number;
  maxPasses?: number;
}

type Macros6 = Required<Pick<SlotMacroTargets, "kcal" | "proteinG" | "fatG" | "carbsG">> & {
  fibreG: number;
  sodiumMg: number;
};

const ZERO: Macros6 = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fibreG: 0, sodiumMg: 0 };

function add(a: Macros6, m: SlotMacroTargets): Macros6 {
  return {
    kcal: a.kcal + m.kcal,
    proteinG: a.proteinG + m.proteinG,
    fatG: a.fatG + m.fatG,
    carbsG: a.carbsG + m.carbsG,
    fibreG: a.fibreG + (m.fibreG ?? 0),
    sodiumMg: a.sodiumMg + (m.sodiumMg ?? 0),
  };
}

/** Sum of every slot's primary actualMacros, optionally skipping one index. */
function sumPrimaries(slots: MealSlot[], skipIdx = -1): Macros6 {
  return slots.reduce(
    (s, slot, idx) => (idx === skipIdx ? s : add(s, slot.primary.actualMacros)),
    { ...ZERO }
  );
}

/**
 * Prioritised proportional error of a candidate DAILY total vs the prescription.
 * Lexicographic via decaying weights: kcal ≫ protein ≫ fibre-floor ≫ carbs/fats.
 */
function objective(
  total: Macros6,
  target: MacroTargets
): { maxPct: number; score: number } {
  const dev = (a: number, t: number) => (t > 0 ? Math.abs(a - t) / t : a === 0 ? 0 : 1);
  const eK = dev(total.kcal, target.totalKcal);
  const eP = dev(total.proteinG, target.proteinG);
  const eC = dev(total.carbsG, target.carbG);
  const eF = dev(total.fatG, target.fatG);
  const fibreFloor = (FIBRE_FLOOR_PER_1000 * target.totalKcal) / 1000;
  const fibreShort = fibreFloor > 0 ? Math.max(0, fibreFloor - total.fibreG) / fibreFloor : 0;
  const score = eK * 1e6 + eP * 1e4 + fibreShort * 1e2 + (eC + eF);
  // Convergence is driven by the protected pair (kcal, protein).
  return { maxPct: Math.max(eK, eP) * 100, score };
}

/**
 * Reconcile primary selections so their summed macros approach the prescription.
 * Returns a new slot array (substitutions untouched — caller regenerates them).
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
  let bestScore = objective(sumPrimaries(work), dailyMacros).score;

  for (let pass = 0; pass < maxPasses; pass++) {
    if (objective(sumPrimaries(work), dailyMacros).maxPct <= tol) break;
    let improved = false;

    for (let i = 0; i < work.length; i++) {
      const validTypes = ctx.validTypesPerSlot[i] ?? [work[i]!.primary.template.mealType];
      const usedByOthers = work.filter((_, j) => j !== i).map((s) => s.primary.template.id);
      const candidates = filterMeals(ctx.templates, {
        validTypes,
        excludeAllergens: ctx.excludeAllergens,
        preferTags: ctx.preferTags,
        excludeIds: usedByOthers,
      });
      if (candidates.length === 0) continue;

      const others = sumPrimaries(work, i);
      let localBestScore = objective(add(others, work[i]!.primary.actualMacros), dailyMacros).score;
      let pick: SelectedMeal | null = null;

      for (const template of candidates) {
        const candidate = assembleMeal(template, work[i]!.targetMacros);
        const total = add(others, candidate.actualMacros);
        const score = objective(total, dailyMacros).score;
        if (score < localBestScore - 1e-9) {
          localBestScore = score;
          pick = candidate;
        }
      }

      if (pick) {
        work[i] = { ...work[i]!, primary: pick };
        improved = true;
      }
    }

    const score = objective(sumPrimaries(work), dailyMacros).score;
    if (score < bestScore) {
      bestScore = score;
      best = work.map((s) => ({ ...s }));
    }
    if (!improved) break;
  }

  return best;
}
