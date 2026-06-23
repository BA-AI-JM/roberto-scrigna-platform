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

import type { MealIngredient, MealTemplate, MealType, SelectedMeal, SlotMacroTargets } from "./types";
import { roundGrams } from "./rounding";
import { resolveFood } from "../../data/meals/food-map";

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
export function assembleMeal(template: MealTemplate, target: SlotMacroTargets): SelectedMeal {
  const work: WorkIng[] = template.ingredients.map((ing) => {
    const cat = classifyFood(ing.foodId);
    const r = resolveFood(ing.foodId);
    return { ing, base: ing.grams, cat, factor: 1, p: r.proteinG, c: r.carbsG, f: r.fatG };
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
  // Final protein correction — protein is protected, so it is solved LAST.
  solveProtein();

  // Build solved ingredients (roundGrams, re-clamp to bounds, never zero).
  let solved: MealIngredient[] = work.map((w) => {
    if (w.cat === "FIXED") return { ...w.ing }; // unchanged, contributes nothing
    const [bMin, bMax] = ingredientGramBounds(w.ing.foodId, w.base, w.cat);
    const raw = clamp(w.base * w.factor, bMin, bMax);
    const grams = Math.max(1, roundGrams(raw));
    return { ...w.ing, grams };
  });

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

// ── Conditional filler (#10/#21) ────────────────────────────────────────────────
//
// When a slot can't reach its carb target (no/insufficient carb source) — or the
// day can't reach the fibre floor — by flexing intrinsic ingredients, append a
// meal-type-appropriate filler drawn ONLY from existing FOOD_MAP foodIds (so
// resolveFood never throws). Fillers are real MealIngredients → they flow to the
// display/PDF/portal. Added ONLY when needed.

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

function fibreFillerFor(mealType: MealType): FillerPick | null {
  switch (mealType) {
    case "lunch":
    case "dinner":
      return { foodId: "broccoli", name: "Broccoli", baseG: 100 };
    case "breakfast":
      return { foodId: "frutti-di-bosco", name: "Frutti di bosco", baseG: 100 };
    case "snack":
    case "pre_workout":
    case "post_workout":
      return { foodId: "mela", name: "Mela", baseG: 100 };
    default:
      return null;
  }
}

function applyFiller(
  ingredients: MealIngredient[],
  pick: FillerPick,
  grams: number
): MealIngredient[] {
  const out = ingredients.map((i) => ({ ...i }));
  const existing = out.find((i) => i.foodId === pick.foodId);
  if (existing) existing.grams = Math.max(1, roundGrams(existing.grams + grams));
  else out.push({ foodId: pick.foodId, name: pick.name, grams: Math.max(1, roundGrams(grams)) });
  return out;
}

/**
 * Top up a slot's carbs toward `slotCarbTargetG` with a meal-type carb filler,
 * if currently >5% short. Returns possibly-augmented ingredients + whether a
 * filler was added.
 */
export function topUpCarb(
  ingredients: MealIngredient[],
  mealType: MealType,
  slotCarbTargetG: number
): { ingredients: MealIngredient[]; added: boolean } {
  if (slotCarbTargetG <= 0) return { ingredients, added: false };
  const current = macrosFromIngredients(ingredients).carbsG;
  if (current >= slotCarbTargetG * 0.95) return { ingredients, added: false };
  const pick = carbFillerFor(mealType);
  if (!pick) return { ingredients, added: false };
  const carbPer100 = resolveFood(pick.foodId).carbsG;
  if (carbPer100 <= 0) return { ingredients, added: false };
  const cat = classifyFood(pick.foodId);
  const [, maxG] = ingredientGramBounds(pick.foodId, pick.baseG, cat);
  const grams = clamp(((slotCarbTargetG - current) / carbPer100) * 100, 1, maxG);
  return { ingredients: applyFiller(ingredients, pick, grams), added: true };
}

/**
 * Add `fibreNeededG` of fibre to a slot via a meal-type fibre filler (veg/fruit).
 * Returns augmented ingredients + whether a filler was added.
 */
export function topUpFibre(
  ingredients: MealIngredient[],
  mealType: MealType,
  fibreNeededG: number
): { ingredients: MealIngredient[]; added: boolean } {
  if (fibreNeededG <= 0) return { ingredients, added: false };
  const pick = fibreFillerFor(mealType);
  if (!pick) return { ingredients, added: false };
  const fibrePer100 = resolveFood(pick.foodId).fibreG;
  if (fibrePer100 <= 0) return { ingredients, added: false };
  const cat = classifyFood(pick.foodId);
  const [, maxG] = ingredientGramBounds(pick.foodId, pick.baseG, cat);
  const grams = clamp((fibreNeededG / fibrePer100) * 100, 1, maxG);
  return { ingredients: applyFiller(ingredients, pick, grams), added: true };
}

/** Recompute a SelectedMeal's actualMacros after its ingredients changed. */
export function remeasure(meal: SelectedMeal): SelectedMeal {
  const m = macrosFromIngredients(meal.scaledIngredients);
  return { ...meal, actualMacros: { kcal: m.kcal, proteinG: m.proteinG, fatG: m.fatG, carbsG: m.carbsG, fibreG: m.fibreG, sodiumMg: m.sodiumMg } };
}
