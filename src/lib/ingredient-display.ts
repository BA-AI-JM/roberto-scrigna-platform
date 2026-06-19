/**
 * Shared ingredient-quantity formatting (#15).
 *
 * Roberto asked for eggs to be shown as a whole-egg count rather than grams
 * ("1 egg ≈ 60 g"). This is a display-only concern — the engine/meal-plan still
 * works in grams; we only relabel egg quantities at render time. Used by the
 * coach review page, the patient portal and the PDF so the wording stays
 * identical everywhere.
 *
 * The "extra protein via egg whites in mL" half of #15 is NOT handled here — it
 * needs per-ingredient macro composition (new albume food + ingredient-level
 * macros), which is deferred to the #10 per-ingredient phase.
 */

/** Grams per whole egg. pending Roberto sign-off (#15 / unit weights) */
export const EGG_GRAMS = 60;

/** Food IDs that should display as whole-unit counts. */
const WHOLE_EGG_FOOD_ID = "uova-intere";

/**
 * Format an ingredient's quantity for display. Whole eggs render as
 * "≈ N uova (X g)"; everything else keeps the existing "Xg" gram label.
 * Falls back to grams-only when the egg count would round to 0.
 */
export function formatIngredientQuantity(
  foodId: string | undefined,
  grams: number
): string {
  const g = Math.round(grams);
  if (foodId === WHOLE_EGG_FOOD_ID) {
    const eggs = Math.round(grams / EGG_GRAMS);
    if (eggs > 0) return `≈ ${eggs} uova (${g} g)`;
  }
  return `${g}g`;
}
