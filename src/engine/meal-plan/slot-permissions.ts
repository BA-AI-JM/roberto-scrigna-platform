/**
 * B1 (#10) — meal-slot food-class permissions, transcribed from Roberto's own
 * model document (docs/reference/MODEL-1-ENG.md §1: Colazione / Spuntino /
 * Pranzo-Cena classes).
 *
 * The engine's swap machinery is category-aware (PROTEIN↔PROTEIN) but was
 * slot-blind: a breakfast yogurt offered every protein in the catalogue —
 * octopus and prawns included. Model 1 defines WHICH foods belong to the
 * breakfast and snack classes; lunch/dinner draw from the full class tables.
 *
 * TRANSCRIPTION, not invention: the allowlists below map Model 1's food lists
 * onto the app catalogue's ids. Judgment calls flagged for Roberto's glance
 * (register #10 note): bresaola admitted at colazione/spuntino as "lean sliced
 * cured meat"; piadina EXCLUDED from breakfast carbs ("cereal/rye/wholemeal
 * bread" reading); whole eggs at spuntino excluded (Model 1 lists egg whites
 * only there). The food DB stays the single source of truth for macro VALUES.
 */
import type { PinnableCategory } from "./types";

export type RestrictedSlot = "breakfast" | "snack";

const BREAKFAST_PROTEIN = [
  "yogurt-greco",     // greek yogurt 0% / skyr
  "latte-scremato",   // maps to kefir/skimmed-milk class
  "fiocchi-di-latte", // cottage cheese
  "ricotta-vaccina",  // light ricotta / quark class
  "albume",           // egg whites / omelets
  "uova-intere",      // whole eggs
  "whey-protein",     // shake / whey top-up
  "bresaola",         // lean sliced cured meat (⚠ judgment call)
] as const;

const SNACK_PROTEIN = [
  "yogurt-greco",
  "latte-scremato",
  "fiocchi-di-latte",
  "ricotta-vaccina",
  "albume",
  "whey-protein",
  "bresaola",         // lean cold-cuts class
] as const;

const MORNING_CARB = [
  "gallette-di-riso", // rice/corn cakes
  "fette-biscottate", // rusks
  "pane-integrale",   // wholemeal bread
  "fiocchi-avena",    // oats
  "farina-avena",
  "granola",          // muesli/cornflakes class
] as const;

const MORNING_FAT = [
  "mandorle",
  "noci",
  "burro-arachidi",
  "avocado",
] as const;

/**
 * Per-slot, per-category allowlists. A slot or category absent here is
 * UNRESTRICTED (lunch/dinner use the full class tables; VEG and FRUIT are
 * never slot-restricted — template composition governs their presence).
 */
export const SLOT_FOOD_PERMISSIONS: Record<
  RestrictedSlot,
  Partial<Record<PinnableCategory, readonly string[]>>
> = {
  breakfast: {
    PROTEIN: BREAKFAST_PROTEIN,
    CARB: MORNING_CARB,
    FAT: MORNING_FAT,
  },
  snack: {
    PROTEIN: SNACK_PROTEIN,
    CARB: MORNING_CARB,
    FAT: MORNING_FAT,
  },
};

function isRestrictedSlot(slot: string): slot is RestrictedSlot {
  return slot === "breakfast" || slot === "snack";
}

/**
 * May `foodId` (of `category`) appear in `slot`?
 * Unknown slots, unrestricted slots, and unrestricted categories → true.
 */
export function isFoodAllowedInSlot(
  foodId: string,
  category: PinnableCategory,
  slot: string | undefined | null
): boolean {
  if (!slot || !isRestrictedSlot(slot)) return true;
  const allow = SLOT_FOOD_PERMISSIONS[slot][category];
  if (!allow) return true;
  return allow.includes(foodId);
}
