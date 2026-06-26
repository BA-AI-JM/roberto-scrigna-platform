/**
 * Per-ingredient gram solver (Stage 2, #21/#15/#10).
 *
 * Replaces the single whole-meal scale factor. Given a template and a slot
 * macro target, it scales each ingredient by a PER-CATEGORY factor (so intra-
 * category proportions are preserved) to hit, in strict priority:
 *   1. protein (PROTECTED)
 *   2. carbs (carb + fruit sources)
 *   3. fat (fat sources, net of incidental fat from the other categories)
 *   4. calories — nudged via carb/fat factors (never protein), kcal taken from
 *      the v3 Calories column (NOT 4P+4C+9F)
 *   5. vegetables for bulk; the day-level fibre floor is handled by the planner.
 *
 * Realism guard: each ingredient's grams stay within a relative band of its
 * template base (×0.4…×2.5) intersected with per-category absolute backstops.
 * `roundGrams` is applied last, then bounds re-checked. Eggs (#15) snap to whole
 * 60 g units with the protein remainder met by egg whites (albume).
 *
 * Nutrition (incl. fibre/sodium) is summed from resolveFood × grams/100.
 */

import type { MealIngredient, MealTemplate, MealType, SelectedMeal, SlotMacroTargets, SourcePin, PinnableCategory } from "./types";
import { roundGrams } from "./rounding";
import { resolveFood, FOOD_MAP } from "../../data/meals/food-map";

// ── Full 6-macro vector ───────────────────────────────────────────────────────

export interface FullMacros {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fibreG: number;
  sodiumMg: number;
}

// ── Classification ─────────────────────────────────────────────────────────────

export type SolveCategory = "PROTEIN" | "CARB" | "VEG" | "FAT" | "FRUIT" | "FIXED";

export function classifyFood(foodId: string): SolveCategory {
  const cat = resolveFood(foodId).category;
  switch (cat) {
    case "Protein Sources": return "PROTEIN";
    case "Carbohydrate Sources": return "CARB";
    case "Vegetables": return "VEG";
    case "Fats and Oils": return "FAT";
    case "Fruit": return "FRUIT";
    default: return "FIXED"; // zero-sentinel (water, spices, honey, jam, soy…)
  }
}

// ── Realism bounds (named, calibratable) ────────────────────────────────────────

/** Relative band applied to each ingredient's TEMPLATE BASE grams. */
export const REL_MIN = 0.4;
export const REL_MAX = 2.5;

/** Absolute g backstops per category (sanity; the relative band usually binds). */
const ABS_BOUNDS: Record<SolveCategory, [number, number]> = {
  PROTEIN: [30, 400],
  CARB: [10, 300],
  VEG: [20, 400],
  FAT: [3, 80], // default for fatty whole foods (nuts/seeds/nut-butter/olives)
  FRUIT: [20, 300],
  FIXED: [0, Number.POSITIVE_INFINITY],
};

/** Per-food overrides inside the FAT category (pure oils vs avocado vs nuts). */
const FAT_FOOD_BOUNDS: Record<string, [number, number]> = {
  "olio-evo": [1, 40], // pure oil
  "avocado": [20, 200],
  // nuts / nut-butter / olives / pesto fall through to ABS_BOUNDS.FAT [3,80]
};

/** Whole-egg unit weight (g) for #15 snapping. */
const EGG_UNIT_G = 60;

/** Universal lower floor so a tiny ingredient never solves to 0 g. */
const MIN_FLOOR_G = 1;

function absMaxFor(foodId: string, cat: SolveCategory): number {
  if (cat === "FAT" && FAT_FOOD_BOUNDS[foodId]) return FAT_FOOD_BOUNDS[foodId]![1];
  return ABS_BOUNDS[cat][1];
}

/**
 * Effective [minG, maxG] for one ingredient. The RELATIVE band (×0.4…×2.5 of the
 * template base) binds normally; the per-category absolute value is only an
 * UPPER sanity cap (so a 10 g garnish is never forced up to a category minimum,
 * and a portion never balloons past a sane ceiling). Lower bound = relative
 * band, floored at MIN_FLOOR_G.
 */
function ingredientGramBounds(foodId: string, baseG: number, cat: SolveCategory): [number, number] {
  const absMax = absMaxFor(foodId, cat);
  const lo = Math.max(REL_MIN * baseG, MIN_FLOOR_G);
  const hi = Math.min(REL_MAX * baseG, absMax);
  return lo <= hi ? [lo, hi] : [hi, hi];
}

/** Allowable single category factor so EVERY ingredient stays in bounds. */
function categoryFactorRange(ings: WorkIng[], cat: SolveCategory): [number, number] {
  let lo = 0;
  let hi = Number.POSITIVE_INFINITY;
  for (const w of ings) {
    if (w.base <= 0) continue;
    const [bMin, bMax] = ingredientGramBounds(w.ing.foodId, w.base, cat);
    lo = Math.max(lo, bMin / w.base);
    hi = Math.min(hi, bMax / w.base);
  }
  if (!Number.isFinite(hi)) hi = REL_MAX;
  return lo <= hi ? [lo, hi] : [hi, hi];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ── Nutrition from grams ────────────────────────────────────────────────────────

/** Sum per-100g v3 nutrition × grams/100 across ingredients. */
export function macrosFromIngredients(ingredients: MealIngredient[]): FullMacros {
  const acc: FullMacros = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fibreG: 0, sodiumMg: 0 };
  for (const ing of ingredients) {
    const f = resolveFood(ing.foodId);
    const g = ing.grams / 100;
    acc.kcal += f.kcal * g;
    acc.proteinG += f.proteinG * g;
    acc.fatG += f.fatG * g;
    acc.carbsG += f.carbsG * g;
    acc.fibreG += f.fibreG * g;
    acc.sodiumMg += f.sodiumMg * g;
  }
  return roundMacros(acc);
}

function roundMacros(m: FullMacros): FullMacros {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    kcal: Math.round(m.kcal),
    proteinG: r1(m.proteinG),
    fatG: r1(m.fatG),
    carbsG: r1(m.carbsG),
    fibreG: r1(m.fibreG),
    sodiumMg: Math.round(m.sodiumMg),
  };
}

// ── Helpers over working ingredients ────────────────────────────────────────────

interface WorkIng {
  ing: MealIngredient;
  base: number;
  cat: SolveCategory;
  factor: number; // current scale vs base
  /** per-100g cache */
  p: number; c: number; f: number;
}

function sumMacroAt(work: WorkIng[], pick: (w: WorkIng) => number): number {
  return work.reduce((s, w) => s + pick(w) * w.base * w.factor / 100, 0);
}

const KCAL_TOL = 0.05; // ±5%

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Solve ingredient grams for `template` to hit `target` (slot macros). Returns a
 * SelectedMeal with solved `scaledIngredients` and `actualMacros` (incl fibre/
 * sodium). `scaleFactor` is intentionally left undefined (Stage 2).
 */
export function assembleMeal(
  template: MealTemplate,
  target: SlotMacroTargets,
  sourcePin?: SourcePin
): SelectedMeal {
  const work: WorkIng[] = template.ingredients.map((ing) => {
    // #16b source pin: if this ingredient's category is pinned to a different
    // (valid) food, swap the foodId/name; the solver then recomputes grams from
    // the pinned food. Unknown pin ids are ignored (never crash) → template food.
    let foodId = ing.foodId;
    let name = ing.name;
    if (sourcePin) {
      const pin = sourcePin[classifyFood(ing.foodId) as PinnableCategory];
      if (pin && pin.foodId !== ing.foodId && FOOD_MAP[pin.foodId]) {
        foodId = pin.foodId;
        name = FOOD_MAP[pin.foodId]!.v3 ?? pin.foodId;
      }
    }
    const cat = classifyFood(foodId);
    const r = resolveFood(foodId);
    return { ing: { ...ing, foodId, name }, base: ing.grams, cat, factor: 1, p: r.proteinG, c: r.carbsG, f: r.fatG };
  });

  const inCat = (cats: SolveCategory[]) => work.filter((w) => cats.includes(w.cat) && w.base > 0);

  const proteinIngs = inCat(["PROTEIN"]);
  const carbIngs = inCat(["CARB", "FRUIT"]);
  const fatIngs = inCat(["FAT"]);

  const solveProtein = () => {
    if (proteinIngs.length === 0 || target.proteinG <= 0) return;
    const incidental = sumMacroAt(work.filter((w) => w.cat !== "PROTEIN"), (w) => w.p);
    const base = proteinIngs.reduce((s, w) => s + (w.p * w.base) / 100, 0);
    if (base <= 0) return;
    const [lo, hi] = categoryFactorRange(proteinIngs, "PROTEIN");
    const fP = clamp((target.proteinG - incidental) / base, lo, hi);
    proteinIngs.forEach((w) => (w.factor = fP));
  };

  // Iterate the per-category solve so protein re-corrects after the carb/fat/
  // kcal factors shift incidental contributions (protein is PROTECTED).
  for (let iter = 0; iter < 3; iter++) {
    // a) PROTEIN
    solveProtein();
    // b) CARB (+ FRUIT)
    if (carbIngs.length > 0 && target.carbsG > 0) {
      const incidental = sumMacroAt(work.filter((w) => w.cat !== "CARB" && w.cat !== "FRUIT"), (w) => w.c);
      const base = carbIngs.reduce((s, w) => s + (w.c * w.base) / 100, 0);
      if (base > 0) {
        const [lo, hi] = categoryFactorRange(carbIngs, "CARB");
        carbIngs.forEach((w) => (w.factor = clamp((target.carbsG - incidental) / base, lo, hi)));
      }
    }
    // c) FAT — net of incidental fat from the other categories
    if (fatIngs.length > 0 && target.fatG > 0) {
      const incidental = sumMacroAt(work.filter((w) => w.cat !== "FAT"), (w) => w.f);
      const base = fatIngs.reduce((s, w) => s + (w.f * w.base) / 100, 0);
      if (base > 0) {
        const [lo, hi] = categoryFactorRange(fatIngs, "FAT");
        fatIngs.forEach((w) => (w.factor = clamp((target.fatG - incidental) / base, lo, hi)));
      }
    }
    // d) CALORIES — nudge CARB then FAT (never PROTEIN) toward ±5% of slot kcal
    if (target.kcal > 0) {
      const kcal = sumMacroAt(work, (w) => resolveFood(w.ing.foodId).kcal);
      if (Math.abs((kcal - target.kcal) / target.kcal) > KCAL_TOL) {
        const adjustGroup = carbIngs.length > 0 ? carbIngs : fatIngs;
        if (adjustGroup.length > 0) {
          const cat: SolveCategory = adjustGroup === carbIngs ? "CARB" : "FAT";
          const [lo, hi] = categoryFactorRange(adjustGroup, cat);
          const cur = adjustGroup[0]!.factor;
          adjustGroup.forEach((w) => (w.factor = clamp(cur * (target.kcal / Math.max(1, kcal)), lo, hi)));
        }
      }
    }
  }
  // Protein correction — protein is protected, so it is solved before fillers.
  solveProtein();

  // ── Flexible fillers (#10/#21) — solved JOINTLY, never bolted on ─────────────
  // Removable carb/fibre sources sized to fit ONLY the slot's leftover kcal
  // HEADROOM (target.kcal × 1.05 − intrinsic kcal). Because they can consume no
  // more than that headroom, they can NEVER push the meal past the kcal-primary
  // band — so the day total stays within ±5% by construction. Fibre (the floor)
  // outranks carbs for the headroom; the carb filler only fires when the slot has
  // NO intrinsic carb source (so rice is never forced onto a low-carb meal that
  // already has a carb source). See `sizeFlexibleFillers`.
  const fillerIngs = sizeFlexibleFillers(work, template, target, carbIngs.length === 0);

  // Re-solve protein with the filler protein treated as incidental, so protein
  // stays PROTECTED even when a fibre veg (e.g. broccoli) carries protein.
  if (proteinIngs.length > 0 && target.proteinG > 0) {
    const base = proteinIngs.reduce((s, w) => s + (w.p * w.base) / 100, 0);
    if (base > 0) {
      const fillerProtein = fillerIngs.reduce(
        (s, i) => s + (resolveFood(i.foodId).proteinG * i.grams) / 100,
        0
      );
      const incidental = sumMacroAt(work.filter((w) => w.cat !== "PROTEIN"), (w) => w.p) + fillerProtein;
      const [lo, hi] = categoryFactorRange(proteinIngs, "PROTEIN");
      const fP = clamp((target.proteinG - incidental) / base, lo, hi);
      proteinIngs.forEach((w) => (w.factor = fP));
    }
  }

  // Build solved intrinsic ingredients (roundGrams, re-clamp to bounds, never zero).
  let solved: MealIngredient[] = work.map((w) => {
    if (w.cat === "FIXED") return { ...w.ing }; // unchanged, contributes nothing
    const [bMin, bMax] = ingredientGramBounds(w.ing.foodId, w.base, w.cat);
    const raw = clamp(w.base * w.factor, bMin, bMax);
    const grams = Math.max(1, roundGrams(raw));
    return { ...w.ing, grams };
  });

  // Merge the flexible fillers in by foodId (so a filler whose food already
  // exists in the meal grows that ingredient instead of creating a duplicate
  // line item), then apply the egg rule across the COMBINED list so the albume
  // remainder accounts for filler protein too.
  for (const filler of fillerIngs) {
    const existing = solved.find((i) => i.foodId === filler.foodId);
    if (existing) existing.grams = Math.max(1, roundGrams(existing.grams + filler.grams));
    else solved.push(filler);
  }

  // #15 — eggs: snap whole eggs to 60 g units, meet residual protein with albume.
  solved = applyEggRule(solved, template, target);

  const m = macrosFromIngredients(solved);
  return {
    template,
    // scaleFactor intentionally omitted (Stage 2).
    scaledIngredients: solved,
    actualMacros: { kcal: m.kcal, proteinG: m.proteinG, fatG: m.fatG, carbsG: m.carbsG, fibreG: m.fibreG, sodiumMg: m.sodiumMg },
  };
}

const WHOLE_EGG_ID = "uova-intere";
const EGG_WHITE_ID = "albume";

/**
 * #15: snap whole eggs to 60 g multiples; if that leaves a protein shortfall
 * versus the slot target, add (or grow) an egg-white ingredient to cover it.
 * Only touches egg-containing meals.
 */
function applyEggRule(
  ingredients: MealIngredient[],
  template: MealTemplate,
  target: SlotMacroTargets
): MealIngredient[] {
  const eggIdx = ingredients.findIndex((i) => i.foodId === WHOLE_EGG_ID);
  if (eggIdx === -1) return ingredients;

  const out = ingredients.map((i) => ({ ...i }));
  const egg = out[eggIdx]!;
  const units = Math.max(1, Math.round(egg.grams / EGG_UNIT_G));
  egg.grams = units * EGG_UNIT_G;

  if (target.proteinG > 0) {
    const current = macrosFromIngredients(out).proteinG;
    const shortfall = target.proteinG - current;
    const whiteP = resolveFood(EGG_WHITE_ID).proteinG; // g protein per 100g
    if (shortfall > 2 && whiteP > 0) {
      const whiteG = Math.max(1, roundGrams(clamp((shortfall / whiteP) * 100, 10, 200)));
      const existing = out.find((i) => i.foodId === EGG_WHITE_ID);
      if (existing) existing.grams = whiteG;
      else out.push({ foodId: EGG_WHITE_ID, name: "Albume d'uovo", grams: whiteG });
    }
  }
  return out;
}

// ── Flexible fillers (#10/#21) ──────────────────────────────────────────────────
//
// Carb/fibre sources drawn ONLY from existing FOOD_MAP foodIds (so resolveFood
// never throws). They are sized INSIDE the solve (`sizeFlexibleFillers`, called
// from `assembleMeal`), bounded by the slot's leftover kcal headroom and fully
// REMOVABLE (size to 0 g when not needed). They are real MealIngredients → they
// flow to the display/PDF/portal. The old additive `topUpCarb`/`topUpFibre`
// (added food AFTER reconcile with no compensation) are gone — they breached the
// kcal/protein guarantees by piling on uncompensated energy.

interface FillerPick { foodId: string; name: string; baseG: number; }

function carbFillerFor(mealType: MealType): FillerPick | null {
  switch (mealType) {
    case "lunch":
    case "dinner":
      return { foodId: "riso-basmati", name: "Riso basmati", baseG: 50 };
    case "breakfast":
      return { foodId: "fiocchi-avena", name: "Fiocchi d'avena", baseG: 40 };
    case "snack":
    case "pre_workout":
    case "post_workout":
      return { foodId: "banana", name: "Banana", baseG: 100 }; // fruit, never rice/potato
    default:
      return null;
  }
}

// Fibre fillers are chosen by fibre-DENSITY (fibre per carb / per kcal) so the
// floor is approached at LEAST carbohydrate + calorie cost — never a fruit, whose
// low fibre-per-carb (~0.17) would over-deliver carbs while chasing fibre.
// Snack/pre/post slots get no fibre filler (no low-carb veg is meal-appropriate
// there); the day floor is carried by the veg-capable slots — see planner
// allocation, which only assigns a fibre target to those slots.
function fibreFillerFor(mealType: MealType): FillerPick | null {
  switch (mealType) {
    case "lunch":
    case "dinner":
      return { foodId: "broccoli", name: "Broccoli", baseG: 100 }; // fib/carb 0.41
    case "breakfast":
      return { foodId: "spinaci", name: "Spinaci", baseG: 80 }; // fib/carb 0.61, 23 kcal/100
    default:
      return null;
  }
}

/** Meal types that can host a low-carb fibre filler (carry the day floor). */
export function isFibreCapableType(mealType: MealType): boolean {
  return mealType === "lunch" || mealType === "dinner" || mealType === "breakfast";
}

/**
 * #16b catalogue: pinnable food sources grouped by solver category, for the
 * wizard's source-swap dropdowns. Server-only (reads the food DB via FOOD_MAP).
 * Excludes FIXED (water/spices) and zero-sentinel entries; name = v3 food name.
 */
export function foodCatalogue(): Record<PinnableCategory, { foodId: string; name: string }[]> {
  const out: Record<PinnableCategory, { foodId: string; name: string }[]> = {
    PROTEIN: [],
    CARB: [],
    VEG: [],
    FAT: [],
    FRUIT: [],
  };
  for (const foodId of Object.keys(FOOD_MAP)) {
    const entry = FOOD_MAP[foodId]!;
    if (entry.via === "zero" || entry.v3 === null) continue;
    const cat = classifyFood(foodId);
    if (cat === "FIXED") continue;
    out[cat as PinnableCategory].push({ foodId, name: entry.v3 });
  }
  for (const k of Object.keys(out) as PinnableCategory[]) {
    out[k].sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

// ── #20 item-level food swap (coach) ─────────────────────────────────────────
//
// Post-generation, a coach can replace ONE ingredient in a meal with a
// same-category alternative. The grams are recomputed ITEM-LOCALLY to reproduce
// the old item's contribution of the category-defining macro (the "smaller
// allowance" — we hold just this item, we do NOT re-solve the whole slot/day via
// assembleMeal). This is the surgical counterpart to the meal-level
// substitution swap; it reuses resolveFood + the realism bounds + roundGrams.

/** The macro a swap holds, keyed by the swapped ingredient's solver category. */
function heldMacroForCategory(cat: SolveCategory): keyof FullMacros {
  switch (cat) {
    case "PROTEIN": return "proteinG";
    case "CARB": return "carbsG";
    case "FRUIT": return "carbsG";
    case "FAT": return "fatG";
    case "VEG": return "kcal"; // veg is low-density bulk → hold energy, not carbs
    default: return "kcal"; // FIXED — never swapped (guarded by getIngredientAlternatives)
  }
}

/**
 * Same-category alternatives for an ingredient, drawn from the shipped
 * `foodCatalogue`, excluding the ingredient itself. FIXED / zero-sentinel
 * ingredients (water, spices, honey…) have no swappable bucket → returns [].
 */
export function getIngredientAlternatives(foodId: string): { foodId: string; name: string }[] {
  const cat = classifyFood(foodId);
  if (cat === "FIXED") return [];
  return foodCatalogue()[cat as PinnableCategory].filter((f) => f.foodId !== foodId);
}

export interface SwappedIngredient {
  foodId: string;
  name: string;
  grams: number;
}

/**
 * #20 item-local recalc: replace `oldIngredient` with `newFoodId` (a same-category
 * alternative) and recompute grams so the new item reproduces the OLD item's
 * contribution of the category-defining macro (protein for PROTEIN, carbs for
 * CARB/FRUIT, fat for FAT, kcal for VEG). Grams are clamped to the per-category
 * realism band and rounded — so when the held macro can't be reproduced within a
 * realistic portion (e.g. a very low-density alternative) the realism cap wins
 * and the contribution is held only as closely as a sane portion allows.
 *
 * THROWS on an unmapped `newFoodId` or a cross-category swap — the caller must
 * validate first (it never silently mis-swaps).
 */
export function recomputeSwappedIngredient(
  oldIngredient: MealIngredient,
  newFoodId: string
): SwappedIngredient {
  if (!FOOD_MAP[newFoodId]) {
    throw new Error(`recomputeSwappedIngredient: unmapped foodId "${newFoodId}"`);
  }
  const oldCat = classifyFood(oldIngredient.foodId);
  const newCat = classifyFood(newFoodId);
  if (oldCat !== newCat) {
    throw new Error(
      `recomputeSwappedIngredient: cross-category swap ${oldCat}→${newCat} rejected`
    );
  }

  const held = heldMacroForCategory(oldCat);
  const oldFood = resolveFood(oldIngredient.foodId);
  const newFood = resolveFood(newFoodId);

  // Old item's contribution of the held macro (one term of macrosFromIngredients).
  const oldContribution = (oldFood[held] * oldIngredient.grams) / 100;
  const newPer100 = newFood[held];

  // Invert to the grams that reproduce that contribution. If the new food has
  // none of the held macro (shouldn't happen within a category, but be safe),
  // fall back to holding kcal so we never divide by zero.
  let grams: number;
  if (newPer100 > 0) {
    grams = (oldContribution / newPer100) * 100;
  } else if (newFood.kcal > 0) {
    grams = ((oldFood.kcal * oldIngredient.grams) / 100 / newFood.kcal) * 100;
  } else {
    grams = oldIngredient.grams;
  }

  // Realism clamp + round (use the computed grams as the new food's base, so the
  // relative band is inert and only the per-category absolute cap + 1 g floor bind).
  const [lo, hi] = ingredientGramBounds(newFoodId, grams, newCat);
  grams = Math.max(1, roundGrams(clamp(grams, lo, hi)));

  return { foodId: newFoodId, name: FOOD_MAP[newFoodId]!.v3 ?? newFoodId, grams };
}

// ── #21 portion adjust (relative bumps) ──────────────────────────────────────
//
// Apply the engine's realism rails to a free-form adjusted gram amount (e.g. a
// coach +10%/−10% portion bump). There is no template base here, so only the
// per-category/per-food ABSOLUTE ceiling + the 1 g floor bind (the relative
// ×0.4…×2.5 band needs a template base and is N/A for a directional nudge).
// Whole eggs snap to 60 g units so a bump never yields a fractional egg.

/**
 * Clamp+round an adjusted ingredient gram amount to the engine's realism rails:
 * whole eggs → nearest 60 g unit (≥1 unit); else round + clamp into
 * [1 g, per-category/per-food cap]. Pure; mirrors the bounds assembleMeal uses.
 */
export function clampAdjustedGrams(foodId: string, grams: number): number {
  if (foodId === WHOLE_EGG_ID) {
    const units = Math.max(1, Math.round(grams / EGG_UNIT_G));
    return units * EGG_UNIT_G;
  }
  const cap = absMaxFor(foodId, classifyFood(foodId));
  return Math.max(1, roundGrams(clamp(grams, MIN_FLOOR_G, cap)));
}

/**
 * Size removable carb/fibre fillers for one meal, JOINTLY with the rest of the
 * solve. Each filler may consume ONLY the slot's leftover kcal headroom
 * (target.kcal × (1 + KCAL_TOL) − intrinsic kcal), so it can never push the meal
 * over the kcal-primary band. Returns the filler ingredients to append (possibly
 * empty — fillers are fully removable).
 *
 * Priority for the shared headroom follows the spec hierarchy: the day FIBRE
 * floor (via `target.fibreG`) outranks carbs, so fibre is sized first; the carb
 * filler then takes whatever headroom is left. The carb filler fires ONLY when
 * the slot has no intrinsic carb source (`carbSourceMissing`) — otherwise the
 * per-ingredient solver already scales the intrinsic carb source to the target,
 * and we must not force extra carbs (this is what kept rice off the low-carb day).
 */
function sizeFlexibleFillers(
  work: WorkIng[],
  template: MealTemplate,
  target: SlotMacroTargets,
  carbSourceMissing: boolean
): MealIngredient[] {
  const out: MealIngredient[] = [];
  const mealType = template.mealType;

  const extra = (pick: (id: string) => number) =>
    out.reduce((s, i) => s + (pick(i.foodId) * i.grams) / 100, 0);
  const curKcal = () => sumMacroAt(work, (w) => resolveFood(w.ing.foodId).kcal) + extra((id) => resolveFood(id).kcal);
  const curCarb = () => sumMacroAt(work, (w) => w.c) + extra((id) => resolveFood(id).carbsG);
  const curFibre = () => sumMacroAt(work, (w) => resolveFood(w.ing.foodId).fibreG) + extra((id) => resolveFood(id).fibreG);
  const headroomKcal = () => Math.max(0, target.kcal * (1 + KCAL_TOL) - curKcal());

  const addFiller = (pick: FillerPick, neededG: number) => {
    const f = resolveFood(pick.foodId);
    const [, maxG] = ingredientGramBounds(pick.foodId, pick.baseG, classifyFood(pick.foodId));
    const kcalCapG = f.kcal > 0 ? (headroomKcal() / f.kcal) * 100 : Number.POSITIVE_INFINITY;
    const grams = Math.min(neededG, kcalCapG, maxG);
    if (grams <= 0.5) return; // not worth adding / no headroom
    const rg = roundGrams(grams);
    if (rg >= 1) out.push({ foodId: pick.foodId, name: pick.name, grams: rg });
  };

  // 1. FIBRE floor (outranks carbs) — grow a removable veg/fruit toward the slot's
  //    day-fibre share, capped by kcal headroom.
  if ((target.fibreG ?? 0) > 0) {
    const pick = fibreFillerFor(mealType);
    const fibrePer100 = pick ? resolveFood(pick.foodId).fibreG : 0;
    if (pick && fibrePer100 > 0) {
      const neededG = ((target.fibreG! - curFibre()) / fibrePer100) * 100;
      if (neededG > 0.5) addFiller(pick, neededG);
    }
  }

  // 2. CARB filler — ONLY when the slot has no intrinsic carb source, sized toward
  //    the slot carb target within the REMAINING headroom (so a tight low-carb day
  //    adds little/none; a day with room reaches its carb target).
  if (carbSourceMissing && target.carbsG > 0 && curCarb() < target.carbsG * 0.95) {
    const pick = carbFillerFor(mealType);
    const carbPer100 = pick ? resolveFood(pick.foodId).carbsG : 0;
    if (pick && carbPer100 > 0) {
      const neededG = ((target.carbsG - curCarb()) / carbPer100) * 100;
      if (neededG > 0.5) addFiller(pick, neededG);
    }
  }

  return out;
}
