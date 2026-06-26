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
  SourcePin,
} from "./types";
import { FIBRE_RESTRICTION_CAP_G } from "./types";
import { assembleMeal } from "./solver";
import { filterMeals } from "./selector";

/** Per-macro proportional tolerance for the convergence check (kcal+protein). */
export const RECONCILE_TOLERANCE_PCT = 5;

/** Fibre floor used to bias selection (g per 1000 kcal). Hard floor enforced by planner. */
const FIBRE_FLOOR_PER_1000 = 10;

/**
 * Deadband (%) for kcal/protein when a restriction protocol is active: inside this
 * band their differences stop dominating so the fibre/sodium caps drive template
 * selection. Tighter than RECONCILE_TOLERANCE_PCT (±5%) so the protected pair keeps
 * a safety margin instead of drifting to the band edge.
 */
const RESTRICTION_DEADBAND_PCT = 4;

const DEFAULT_MAX_PASSES = 12;

export interface ReconcileContext {
  templates: MealTemplate[];
  validTypesPerSlot: MealType[][];
  excludeAllergens: Allergen[];
  preferTags: MealTag[];
  tolerancePct?: number;
  maxPasses?: number;
  /** Combat-sport restriction protocols (#11) — bias template selection. */
  fibreMode?: "floor" | "cap";
  fibreCapG?: number;
  sodiumCapMg?: number;
  /** Coach source pins (#16b) for THIS day-type — forwarded to assembleMeal. */
  sourcePin?: SourcePin;
}

/** Protocol params threaded into the objective. */
interface ObjProtocols {
  fibreMode?: "floor" | "cap";
  fibreCapG?: number;
  sodiumCapMg?: number;
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
 * Lexicographic via decaying weights: kcal ≫ protein ≫ {fibre + sodium} ≫ carbs/fats.
 *
 * The fibre/sodium term sits between protein and carbs/fats — so the restriction
 * caps (fibre cap, sodium cap) and the default fibre floor all YIELD to the
 * protected pair (kcal, protein) but OUTRANK carbs/fats. `restrictionPenalty` is
 * returned separately so the convergence loop only stops once both the protected
 * pair AND any active restriction are satisfied.
 */
function objective(
  total: Macros6,
  target: MacroTargets,
  p: ObjProtocols = {}
): { maxPct: number; score: number; restrictionPenalty: number } {
  const dev = (a: number, t: number) => (t > 0 ? Math.abs(a - t) / t : a === 0 ? 0 : 1);
  const eK = dev(total.kcal, target.totalKcal);
  const eP = dev(total.proteinG, target.proteinG);
  const eC = dev(total.carbsG, target.carbG);
  const eF = dev(total.fatG, target.fatG);

  // Fibre: cap (penalise EXCESS over the cap) or floor (penalise SHORTFALL).
  let fibrePenalty: number;
  if (p.fibreMode === "cap") {
    const cap = p.fibreCapG ?? FIBRE_RESTRICTION_CAP_G;
    fibrePenalty = cap > 0 ? Math.max(0, total.fibreG - cap) / cap : 0;
  } else {
    const floor = (FIBRE_FLOOR_PER_1000 * target.totalKcal) / 1000;
    fibrePenalty = floor > 0 ? Math.max(0, floor - total.fibreG) / floor : 0;
  }

  // Sodium cap (only when the restriction is active): penalise EXCESS over the cap.
  const sodiumPenalty =
    p.sodiumCapMg && p.sodiumCapMg > 0
      ? Math.max(0, total.sodiumMg - p.sodiumCapMg) / p.sodiumCapMg
      : 0;

  // The 1e2 slot always carries fibre + sodium (fibrePenalty is shortfall in floor
  // mode, excess in cap mode). restrictionPenalty (the convergence gate) is only
  // the HARD caps — fibre cap + sodium cap — not the best-effort fibre floor.
  const penalty1e2 = fibrePenalty + sodiumPenalty;
  const restrictionPenalty = (p.fibreMode === "cap" ? fibrePenalty : 0) + sodiumPenalty;
  const restrictionActive = p.fibreMode === "cap" || (p.sodiumCapMg ?? 0) > 0;

  let score: number;
  if (restrictionActive) {
    // DEADBAND: once kcal/protein are inside the protected ±tol band, their tiny
    // differences must NOT dominate the restriction caps (weight 1e2) — otherwise
    // a <1% kcal wobble between templates outranks a 500 mg sodium win and the cap
    // is never enforced. So kcal/protein are penalised only BEYOND ±tol; inside the
    // band the cap (then carbs/fats) drives selection, with a tiny in-band pull
    // keeping kcal/protein near target when the cap is indifferent. kcal+protein
    // stay PROTECTED (any breach past ±tol still dominates at 1e6/1e4). The
    // deadband is tighter than the ±5% bound so the FINAL pair keeps a safety
    // margin rather than drifting to the very edge to chase the caps.
    const tol = RESTRICTION_DEADBAND_PCT / 100;
    const eKpen = Math.max(0, eK - tol);
    const ePpen = Math.max(0, eP - tol);
    score = eKpen * 1e6 + ePpen * 1e4 + penalty1e2 * 1e2 + (eC + eF) + (eK + eP) * 1e-2;
  } else {
    // Original objective (regression-safe): kcal ≫ protein ≫ fibre-floor ≫ carbs/fats.
    score = eK * 1e6 + eP * 1e4 + penalty1e2 * 1e2 + (eC + eF);
  }
  // Convergence is driven by the protected pair (kcal, protein).
  return { maxPct: Math.max(eK, eP) * 100, score, restrictionPenalty };
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
  const protocols: ObjProtocols = {
    fibreMode: ctx.fibreMode,
    fibreCapG: ctx.fibreCapG,
    sodiumCapMg: ctx.sodiumCapMg,
  };

  let work = slots.map((s) => ({ ...s }));
  let best = work.map((s) => ({ ...s }));
  let bestScore = objective(sumPrimaries(work), dailyMacros, protocols).score;

  for (let pass = 0; pass < maxPasses; pass++) {
    // Stop only when the protected pair converged AND any active restriction is
    // satisfied — so fibre/sodium caps keep being pursued past kcal/protein.
    const cur = objective(sumPrimaries(work), dailyMacros, protocols);
    if (cur.maxPct <= tol && cur.restrictionPenalty <= 1e-9) break;
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
      let localBestScore = objective(add(others, work[i]!.primary.actualMacros), dailyMacros, protocols).score;
      let pick: SelectedMeal | null = null;

      for (const template of candidates) {
        const candidate = assembleMeal(template, work[i]!.targetMacros, ctx.sourcePin);
        const total = add(others, candidate.actualMacros);
        const score = objective(total, dailyMacros, protocols).score;
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

    const score = objective(sumPrimaries(work), dailyMacros, protocols).score;
    if (score < bestScore) {
      bestScore = score;
      best = work.map((s) => ({ ...s }));
    }
    if (!improved) break;
  }

  return best;
}
