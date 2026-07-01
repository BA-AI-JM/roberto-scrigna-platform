/**
 * Mapping from template ingredient foodIds (slugs used in templates.ts) to v3
 * food-database rows, plus a resolver (#food-enrichment, Stage 1 — DORMANT).
 *
 * Nothing in plan generation imports this yet. Stage 2 will use `resolveFood`
 * to compute per-ingredient macros (incl. fibre/sodium) instead of the current
 * template-aggregate × single-factor approach.
 *
 * `via`:
 *   "exact" — the v3 row is a direct match for the ingredient
 *   "sub"   — a reasonable substitute (no exact v3 entry)
 *   "zero"  — no nutritional contribution modelled (water, lemon, spices,
 *             cocoa/honey/jam/soy used in trace amounts) → all-zero macros
 */

import type { FoodItem } from "../types";
import { FOOD_DATA } from "./food-data.generated";

export interface FoodMapEntry {
  /** v3 "Food Name" to resolve, or null for the zero-sentinel. */
  v3: string | null;
  via: "exact" | "sub" | "zero";
}

export const FOOD_MAP: Record<string, FoodMapEntry> = {
  "acqua": { v3: null, via: "zero" },
  // #15: egg whites — used by the solver to meet the fine protein remainder in
  // egg meals after whole-egg (60 g) snapping. Not used by any template directly.
  "albume": { v3: "Egg white (raw)", via: "exact" },
  "avocado": { v3: "Avocado (flesh)", via: "exact" },
  "banana": { v3: "Banana (peeled)", via: "exact" },
  "bresaola": { v3: "Bresaola (air-dried beef)", via: "exact" },
  "broccoli": { v3: "Broccoli (raw)", via: "exact" },
  "burro-arachidi": { v3: "Peanut butter (natural)", via: "exact" },
  "cacao-amaro": { v3: null, via: "zero" },
  "carote": { v3: "Carrots (raw)", via: "exact" },
  "cous-cous": { v3: "Couscous, durum wheat semolina (dry)", via: "exact" },
  "edamame": { v3: "Broad beans / fava beans (fresh)", via: "sub" },
  "fagiolini": { v3: "Green beans (raw)", via: "exact" },
  "farina-avena": { v3: "Oat flour (dry)", via: "exact" },
  "feta": { v3: "Halloumi cheese", via: "sub" },
  "fette-biscottate": { v3: "Wasa crackers", via: "sub" },
  "fiocchi-avena": { v3: "Oats rolled (dry)", via: "exact" },
  "fiocchi-di-latte": { v3: "Cottage cheese low-fat", via: "exact" },
  "frutti-di-bosco": { v3: "Blueberries (fresh)", via: "sub" },
  "funghi-champignon": { v3: "Mushrooms, button / champignon (raw)", via: "exact" },
  "gallette-di-riso": { v3: "Wasa crackers", via: "sub" },
  "gamberi": { v3: "Shrimp (raw, peeled)", via: "exact" },
  "grana-padano": { v3: "Parmesan (grated)", via: "sub" },
  "granola": { v3: "Oats rolled (dry)", via: "sub" },
  "latte-scremato": { v3: "Kefir, plain (low-fat)", via: "sub" },
  "lattuga": { v3: "Romaine lettuce (raw)", via: "exact" },
  "limone": { v3: null, via: "zero" },
  "mais": { v3: "Green peas (canned, drained & rinsed)", via: "sub" },
  "mandorle": { v3: "Almonds (whole)", via: "exact" },
  "mango": { v3: "Mango (Ataulfo, peeled, raw)", via: "exact" },
  "manzo-controfiletto": { v3: "Beef sirloin steak (raw)", via: "exact" },
  "manzo-filetto": { v3: "Beef sirloin steak (raw)", via: "sub" },
  "marmellata": { v3: null, via: "zero" },
  "mela": { v3: "Apple (whole)", via: "exact" },
  "melanzane": { v3: "Aubergine / eggplant (raw)", via: "exact" },
  "miele": { v3: null, via: "zero" },
  "noci": { v3: "Walnuts", via: "exact" },
  "olio-evo": { v3: "Olive oil", via: "exact" },
  "olive": { v3: "Black olives (drained)", via: "exact" },
  "orata": { v3: "Sea bass (raw fillet)", via: "sub" },
  "pane-integrale": { v3: "Wholegrain bread", via: "exact" },
  "parmigiano": { v3: "Parmesan (grated)", via: "exact" },
  "passata-pomodoro": { v3: "Tomatoes (raw)", via: "sub" },
  "pasta-integrale": { v3: "Pasta durum wheat (dry)", via: "sub" },
  "patata-dolce": { v3: "Sweet potato (raw, peeled)", via: "exact" },
  "patate": { v3: "Potato white (raw, peeled)", via: "exact" },
  "peperoni": { v3: "Red peppers (raw)", via: "exact" },
  "pesto-genovese": { v3: "Pesto Genovese (prepared)", via: "exact" },
  "petto-pollo": { v3: "Chicken breast (raw)", via: "exact" },
  "petto-tacchino": { v3: "Turkey breast (raw)", via: "exact" },
  "piadina": { v3: "Pita bread (white)", via: "sub" },
  "polpo": { v3: "Mussels (raw, shelled)", via: "sub" },
  "pomodorini": { v3: "Tomatoes (raw)", via: "sub" },
  "prezzemolo": { v3: null, via: "zero" },
  "quinoa": { v3: "Quinoa (dry)", via: "exact" },
  "ricotta-vaccina": { v3: "Ricotta cheese, lean", via: "exact" },
  "riso-basmati": { v3: "Basmati rice (dry)", via: "exact" },
  "riso-carnaroli": { v3: "Carnaroli rice (dry)", via: "exact" },
  "riso-venere": { v3: "Brown rice (dry)", via: "sub" },
  "rucola": { v3: "Rocket / arugula (raw)", via: "exact" },
  "salmone": { v3: "Salmon Atlantic (raw)", via: "exact" },
  "salsa-soia": { v3: null, via: "zero" },
  "spinaci": { v3: "Spinach (raw)", via: "exact" },
  "tacchino-macinato": { v3: "Turkey breast (raw)", via: "sub" },
  "tonno-scatola": { v3: "Tuna canned in water (drained)", via: "exact" },
  "uova-intere": { v3: "Whole egg (raw)", via: "exact" },
  "whey-protein": { v3: "Whey protein powder", via: "exact" },
  "yogurt-greco": { v3: "Greek yogurt 0% fat", via: "exact" },
  "zucchine": { v3: "Zucchini (raw)", via: "exact" },
};

/** Resolved per-100g nutrition for an ingredient (callers multiply by grams/100). */
export interface ResolvedFood {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
  sodiumMg: number;
  /** v3 Category verbatim, or "zero" for the zero-sentinel. */
  category: string;
  via: "exact" | "sub" | "zero";
}

// The v3 food DB is BUNDLED as a generated module (food-data.generated.ts) so it
// ships inside the JS bundle — no runtime readFileSync of an import.meta.url-computed
// path (which Next's file tracer can't resolve → ENOENT on the Vercel serverless
// function → plan.generate/foodCatalogue 500). Fruit-preferred dedup is already baked
// in (parseFoodV3Csv was run at generation time). Regenerate after editing the CSV:
//   bun run scripts/gen-food-data.ts   (a test asserts it matches a fresh CSV parse)
let _byName: Map<string, FoodItem> | null = null;
function foodByName(): Map<string, FoodItem> {
  if (_byName) return _byName;
  _byName = new Map(FOOD_DATA.map((it) => [it.name, it]));
  return _byName;
}

/**
 * Resolve a template ingredient foodId to per-100g nutrition via FOOD_MAP.
 * Throws if the foodId is unmapped. Zero-sentinel entries return all-zero
 * macros with category "zero".
 */
export function resolveFood(foodId: string): ResolvedFood {
  const entry = FOOD_MAP[foodId];
  if (!entry) {
    throw new Error(`resolveFood: unmapped foodId "${foodId}"`);
  }
  if (entry.via === "zero" || entry.v3 === null) {
    return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, category: "zero", via: "zero" };
  }
  const row = foodByName().get(entry.v3);
  if (!row) {
    throw new Error(`resolveFood: v3 row not found for "${entry.v3}" (foodId "${foodId}")`);
  }
  return {
    kcal: row.kcalPer100g,
    proteinG: row.proteinPer100g,
    carbsG: row.carbsPer100g,
    fatG: row.fatPer100g,
    fibreG: row.fibreG ?? 0,
    sodiumMg: row.sodiumMg ?? 0,
    category: row.category ?? "",
    via: entry.via,
  };
}
