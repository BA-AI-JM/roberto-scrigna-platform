/**
 * 26 meal templates for the Roberto Scrigna platform.
 *
 * Categories:
 * - 7 breakfast (BKFST_01 - BKFST_07)
 * - 4 snack (SNACK_01 - SNACK_04) — v4.4.1 updates applied
 * - 15 main meals (MAIN_01 - MAIN_15, including MAIN_13/14/15 from Part 11.2)
 *
 * Macro values based on Roberto's CSV food database.
 * All values are per base serving.
 */

import type { MealTemplate } from "../../engine/meal-plan/types";

// ── Breakfasts ──────────────────────────────────────────────────────────────

const BKFST_01: MealTemplate = {
  id: "BKFST_01",
  name: "Porridge Proteico con Frutti di Bosco",
  mealType: "breakfast",
  description: "Oat porridge with whey protein and mixed berries",
  kcalPerServing: 420,
  proteinG: 35,
  carbsG: 50,
  fatG: 8,
  ingredients: [
    { foodId: "fiocchi-avena", name: "Fiocchi d'avena", grams: 60 },
    { foodId: "whey-protein", name: "Whey protein", grams: 30 },
    { foodId: "frutti-di-bosco", name: "Frutti di bosco", grams: 80 },
    { foodId: "latte-scremato", name: "Latte scremato", grams: 150 },
  ],
  tags: ["high_protein", "meal_prep_friendly"],
  allergens: ["gluten", "dairy"],
  isActive: true,
};

const BKFST_02: MealTemplate = {
  id: "BKFST_02",
  name: "Pancake Proteici alla Banana",
  mealType: "breakfast",
  description: "Protein pancakes with banana and honey",
  kcalPerServing: 450,
  proteinG: 38,
  carbsG: 52,
  fatG: 10,
  ingredients: [
    { foodId: "farina-avena", name: "Farina d'avena", grams: 50 },
    { foodId: "whey-protein", name: "Whey protein", grams: 30 },
    { foodId: "banana", name: "Banana", grams: 100 },
    { foodId: "uova-intere", name: "Uova intere", grams: 50 },
    { foodId: "miele", name: "Miele", grams: 10 },
  ],
  tags: ["high_protein", "quick_prep"],
  allergens: ["gluten", "dairy", "eggs"],
  isActive: true,
};

const BKFST_03: MealTemplate = {
  id: "BKFST_03",
  name: "Yogurt Greco con Granola e Miele",
  mealType: "breakfast",
  description: "Greek yogurt with homemade granola and honey",
  kcalPerServing: 380,
  proteinG: 30,
  carbsG: 42,
  fatG: 10,
  ingredients: [
    { foodId: "yogurt-greco", name: "Yogurt greco 0%", grams: 200 },
    { foodId: "granola", name: "Granola", grams: 40 },
    { foodId: "miele", name: "Miele", grams: 15 },
    { foodId: "mandorle", name: "Mandorle", grams: 10 },
  ],
  tags: ["high_protein", "quick_prep"],
  allergens: ["dairy", "nuts", "gluten"],
  isActive: true,
};

const BKFST_04: MealTemplate = {
  id: "BKFST_04",
  name: "Toast con Uova e Avocado",
  mealType: "breakfast",
  description: "Whole grain toast with scrambled eggs and avocado",
  kcalPerServing: 430,
  proteinG: 25,
  carbsG: 35,
  fatG: 22,
  ingredients: [
    { foodId: "pane-integrale", name: "Pane integrale", grams: 60 },
    { foodId: "uova-intere", name: "Uova intere", grams: 100 },
    { foodId: "avocado", name: "Avocado", grams: 50 },
  ],
  tags: ["quick_prep", "italian"],
  allergens: ["gluten", "eggs"],
  isActive: true,
};

const BKFST_05: MealTemplate = {
  id: "BKFST_05",
  name: "Smoothie Proteico Tropicale",
  mealType: "breakfast",
  description: "Tropical protein smoothie with mango and coconut",
  kcalPerServing: 350,
  proteinG: 32,
  carbsG: 40,
  fatG: 6,
  ingredients: [
    { foodId: "whey-protein", name: "Whey protein", grams: 30 },
    { foodId: "banana", name: "Banana", grams: 80 },
    { foodId: "mango", name: "Mango", grams: 80 },
    { foodId: "latte-scremato", name: "Latte scremato", grams: 200 },
  ],
  tags: ["high_protein", "quick_prep"],
  allergens: ["dairy"],
  isActive: true,
};

const BKFST_06: MealTemplate = {
  id: "BKFST_06",
  name: "Fette Biscottate con Ricotta e Marmellata",
  mealType: "breakfast",
  description: "Rusks with ricotta cheese and sugar-free jam",
  kcalPerServing: 340,
  proteinG: 20,
  carbsG: 45,
  fatG: 8,
  ingredients: [
    { foodId: "fette-biscottate", name: "Fette biscottate", grams: 40 },
    { foodId: "ricotta-vaccina", name: "Ricotta vaccina", grams: 80 },
    { foodId: "marmellata", name: "Marmellata senza zucchero", grams: 20 },
  ],
  tags: ["italian", "quick_prep"],
  allergens: ["gluten", "dairy"],
  isActive: true,
};

const BKFST_07: MealTemplate = {
  id: "BKFST_07",
  name: "Overnight Oats Cioccolato e Banana",
  mealType: "breakfast",
  description: "Overnight oats with cocoa, banana, and peanut butter",
  kcalPerServing: 460,
  proteinG: 30,
  carbsG: 55,
  fatG: 14,
  ingredients: [
    { foodId: "fiocchi-avena", name: "Fiocchi d'avena", grams: 60 },
    { foodId: "whey-protein", name: "Whey protein", grams: 25 },
    { foodId: "banana", name: "Banana", grams: 80 },
    { foodId: "cacao-amaro", name: "Cacao amaro", grams: 8 },
    { foodId: "burro-arachidi", name: "Burro d'arachidi", grams: 10 },
    { foodId: "latte-scremato", name: "Latte scremato", grams: 150 },
  ],
  tags: ["high_protein", "meal_prep_friendly"],
  allergens: ["gluten", "dairy", "nuts"],
  isActive: true,
};

// ── Snacks (v4.4.1 updates applied) ────────────────────────────────────────

const SNACK_01: MealTemplate = {
  id: "SNACK_01",
  name: "Gallette di Riso con Burro d'Arachidi",
  mealType: "snack",
  description: "Rice cakes with peanut butter and banana slices",
  kcalPerServing: 250,
  proteinG: 12,
  carbsG: 28,
  fatG: 10,
  ingredients: [
    { foodId: "gallette-di-riso", name: "Gallette di riso", grams: 30 },
    { foodId: "burro-arachidi", name: "Burro d'arachidi", grams: 15 },
    { foodId: "banana", name: "Banana", grams: 50 },
  ],
  tags: ["quick_prep", "pre_workout"],
  allergens: ["nuts"],
  isActive: true,
};

const SNACK_02: MealTemplate = {
  id: "SNACK_02",
  name: "Yogurt Greco con Frutta Secca",
  mealType: "snack",
  description: "Greek yogurt with mixed nuts and honey drizzle",
  kcalPerServing: 220,
  proteinG: 20,
  carbsG: 15,
  fatG: 9,
  ingredients: [
    { foodId: "yogurt-greco", name: "Yogurt greco 0%", grams: 150 },
    { foodId: "noci", name: "Noci", grams: 10 },
    { foodId: "miele", name: "Miele", grams: 8 },
  ],
  tags: ["high_protein", "quick_prep"],
  allergens: ["dairy", "nuts"],
  isActive: true,
};

const SNACK_03: MealTemplate = {
  id: "SNACK_03",
  name: "Shake Proteico Post-Allenamento",
  mealType: "snack",
  description: "Post-workout protein shake with banana and oats",
  kcalPerServing: 300,
  proteinG: 35,
  carbsG: 30,
  fatG: 5,
  ingredients: [
    { foodId: "whey-protein", name: "Whey protein", grams: 35 },
    { foodId: "banana", name: "Banana", grams: 80 },
    { foodId: "fiocchi-avena", name: "Fiocchi d'avena", grams: 20 },
    { foodId: "acqua", name: "Acqua", grams: 250 },
  ],
  tags: ["high_protein", "post_workout", "quick_prep"],
  allergens: ["dairy", "gluten"],
  isActive: true,
};

const SNACK_04: MealTemplate = {
  id: "SNACK_04",
  name: "Frutta con Fiocchi di Latte",
  mealType: "snack",
  description: "Cottage cheese with fresh fruit",
  kcalPerServing: 180,
  proteinG: 18,
  carbsG: 18,
  fatG: 4,
  ingredients: [
    { foodId: "fiocchi-di-latte", name: "Fiocchi di latte", grams: 150 },
    { foodId: "mela", name: "Mela", grams: 120 },
  ],
  tags: ["high_protein", "low_fat", "quick_prep"],
  allergens: ["dairy"],
  isActive: true,
};

// ── Main Meals (lunch / dinner) ─────────────────────────────────────────────

const MAIN_01: MealTemplate = {
  id: "MAIN_01",
  name: "Petto di Pollo con Riso Basmati e Broccoli",
  mealType: "lunch",
  description: "Grilled chicken breast with basmati rice and steamed broccoli",
  kcalPerServing: 520,
  proteinG: 45,
  carbsG: 55,
  fatG: 10,
  ingredients: [
    { foodId: "petto-pollo", name: "Petto di pollo", grams: 180 },
    { foodId: "riso-basmati", name: "Riso basmati", grams: 80 },
    { foodId: "broccoli", name: "Broccoli", grams: 150 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 5 },
  ],
  tags: ["high_protein", "low_fat", "meal_prep_friendly"],
  allergens: [],
  isActive: true,
};

const MAIN_02: MealTemplate = {
  id: "MAIN_02",
  name: "Salmone al Forno con Patate Dolci",
  mealType: "dinner",
  description: "Baked salmon with sweet potatoes and green beans",
  kcalPerServing: 550,
  proteinG: 40,
  carbsG: 45,
  fatG: 20,
  ingredients: [
    { foodId: "salmone", name: "Salmone", grams: 170 },
    { foodId: "patata-dolce", name: "Patata dolce", grams: 200 },
    { foodId: "fagiolini", name: "Fagiolini", grams: 100 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 5 },
  ],
  tags: ["high_protein", "italian"],
  allergens: ["fish"],
  isActive: true,
};

const MAIN_03: MealTemplate = {
  id: "MAIN_03",
  name: "Pasta Integrale con Ragù di Tacchino",
  mealType: "lunch",
  description: "Whole wheat pasta with turkey bolognese",
  kcalPerServing: 530,
  proteinG: 40,
  carbsG: 60,
  fatG: 12,
  ingredients: [
    { foodId: "pasta-integrale", name: "Pasta integrale", grams: 80 },
    { foodId: "tacchino-macinato", name: "Tacchino macinato", grams: 150 },
    { foodId: "passata-pomodoro", name: "Passata di pomodoro", grams: 100 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 5 },
  ],
  tags: ["high_protein", "italian", "meal_prep_friendly"],
  allergens: ["gluten"],
  isActive: true,
};

const MAIN_04: MealTemplate = {
  id: "MAIN_04",
  name: "Tonno in Scatola con Insalata di Riso",
  mealType: "lunch",
  description: "Canned tuna with rice salad and vegetables",
  kcalPerServing: 460,
  proteinG: 38,
  carbsG: 50,
  fatG: 10,
  ingredients: [
    { foodId: "tonno-scatola", name: "Tonno in scatola sgocciolato", grams: 140 },
    { foodId: "riso-basmati", name: "Riso basmati", grams: 70 },
    { foodId: "pomodorini", name: "Pomodorini", grams: 80 },
    { foodId: "mais", name: "Mais", grams: 40 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 5 },
  ],
  tags: ["high_protein", "meal_prep_friendly", "quick_prep"],
  allergens: ["fish"],
  isActive: true,
};

const MAIN_05: MealTemplate = {
  id: "MAIN_05",
  name: "Filetto di Manzo con Quinoa e Verdure",
  mealType: "dinner",
  description: "Beef fillet with quinoa and roasted vegetables",
  kcalPerServing: 560,
  proteinG: 48,
  carbsG: 42,
  fatG: 18,
  ingredients: [
    { foodId: "manzo-filetto", name: "Filetto di manzo", grams: 180 },
    { foodId: "quinoa", name: "Quinoa", grams: 60 },
    { foodId: "zucchine", name: "Zucchine", grams: 100 },
    { foodId: "peperoni", name: "Peperoni", grams: 80 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 8 },
  ],
  tags: ["high_protein", "italian"],
  allergens: [],
  isActive: true,
};

const MAIN_06: MealTemplate = {
  id: "MAIN_06",
  name: "Orata al Forno con Verdure Grigliate",
  mealType: "dinner",
  description: "Baked sea bream with grilled Mediterranean vegetables",
  kcalPerServing: 440,
  proteinG: 42,
  carbsG: 20,
  fatG: 20,
  ingredients: [
    { foodId: "orata", name: "Orata", grams: 220 },
    { foodId: "melanzane", name: "Melanzane", grams: 100 },
    { foodId: "pomodorini", name: "Pomodorini", grams: 80 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 10 },
  ],
  tags: ["high_protein", "low_carb", "italian"],
  allergens: ["fish"],
  isActive: true,
};

const MAIN_07: MealTemplate = {
  id: "MAIN_07",
  name: "Risotto con Petto di Pollo e Funghi",
  mealType: "lunch",
  description: "Chicken and mushroom risotto",
  kcalPerServing: 510,
  proteinG: 40,
  carbsG: 58,
  fatG: 12,
  ingredients: [
    { foodId: "riso-carnaroli", name: "Riso carnaroli", grams: 80 },
    { foodId: "petto-pollo", name: "Petto di pollo", grams: 150 },
    { foodId: "funghi-champignon", name: "Funghi champignon", grams: 100 },
    { foodId: "parmigiano", name: "Parmigiano reggiano", grams: 10 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 5 },
  ],
  tags: ["italian", "high_protein"],
  allergens: ["dairy"],
  isActive: true,
};

const MAIN_08: MealTemplate = {
  id: "MAIN_08",
  name: "Petto di Tacchino con Cous Cous e Verdure",
  mealType: "lunch",
  description: "Turkey breast with couscous and mixed vegetables",
  kcalPerServing: 480,
  proteinG: 42,
  carbsG: 50,
  fatG: 10,
  ingredients: [
    { foodId: "petto-tacchino", name: "Petto di tacchino", grams: 170 },
    { foodId: "cous-cous", name: "Cous cous", grams: 70 },
    { foodId: "zucchine", name: "Zucchine", grams: 80 },
    { foodId: "carote", name: "Carote", grams: 60 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 5 },
  ],
  tags: ["high_protein", "low_fat", "meal_prep_friendly"],
  allergens: ["gluten"],
  isActive: true,
};

const MAIN_09: MealTemplate = {
  id: "MAIN_09",
  name: "Uova Strapazzate con Pane Integrale e Verdure",
  mealType: "dinner",
  description: "Scrambled eggs with whole grain bread and sautéed spinach",
  kcalPerServing: 420,
  proteinG: 28,
  carbsG: 35,
  fatG: 18,
  ingredients: [
    { foodId: "uova-intere", name: "Uova intere", grams: 150 },
    { foodId: "pane-integrale", name: "Pane integrale", grams: 50 },
    { foodId: "spinaci", name: "Spinaci", grams: 100 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 5 },
  ],
  tags: ["quick_prep", "vegetarian"],
  allergens: ["eggs", "gluten"],
  isActive: true,
};

const MAIN_10: MealTemplate = {
  id: "MAIN_10",
  name: "Insalata di Pollo con Feta e Olive",
  mealType: "lunch",
  description: "Chicken salad with feta cheese, olives, and mixed greens",
  kcalPerServing: 450,
  proteinG: 40,
  carbsG: 15,
  fatG: 25,
  ingredients: [
    { foodId: "petto-pollo", name: "Petto di pollo", grams: 160 },
    { foodId: "feta", name: "Feta", grams: 40 },
    { foodId: "olive", name: "Olive", grams: 20 },
    { foodId: "lattuga", name: "Lattuga", grams: 80 },
    { foodId: "pomodorini", name: "Pomodorini", grams: 60 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 8 },
  ],
  tags: ["high_protein", "low_carb"],
  allergens: ["dairy"],
  isActive: true,
};

const MAIN_11: MealTemplate = {
  id: "MAIN_11",
  name: "Polpo con Patate",
  mealType: "dinner",
  description: "Octopus with potatoes, Mediterranean style",
  kcalPerServing: 420,
  proteinG: 38,
  carbsG: 40,
  fatG: 10,
  ingredients: [
    { foodId: "polpo", name: "Polpo", grams: 200 },
    { foodId: "patate", name: "Patate", grams: 200 },
    { foodId: "prezzemolo", name: "Prezzemolo", grams: 5 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 8 },
  ],
  tags: ["italian", "high_protein"],
  allergens: ["shellfish"],
  isActive: true,
};

const MAIN_12: MealTemplate = {
  id: "MAIN_12",
  name: "Piadina con Bresaola e Rucola",
  mealType: "lunch",
  description: "Flatbread with bresaola, rocket, and parmesan shavings",
  kcalPerServing: 440,
  proteinG: 35,
  carbsG: 45,
  fatG: 12,
  ingredients: [
    { foodId: "piadina", name: "Piadina integrale", grams: 80 },
    { foodId: "bresaola", name: "Bresaola", grams: 80 },
    { foodId: "rucola", name: "Rucola", grams: 30 },
    { foodId: "parmigiano", name: "Parmigiano reggiano", grams: 15 },
  ],
  tags: ["italian", "quick_prep", "high_protein"],
  allergens: ["gluten", "dairy"],
  isActive: true,
};

// ── MAIN_13/14/15 from build plan Part 11.2 ────────────────────────────────

const MAIN_13: MealTemplate = {
  id: "MAIN_13",
  name: "Bowl di Gamberi con Riso Venere",
  mealType: "dinner",
  description: "Shrimp bowl with black Venus rice and edamame",
  kcalPerServing: 490,
  proteinG: 38,
  carbsG: 52,
  fatG: 12,
  ingredients: [
    { foodId: "gamberi", name: "Gamberi sgusciati", grams: 180 },
    { foodId: "riso-venere", name: "Riso Venere", grams: 70 },
    { foodId: "edamame", name: "Edamame", grams: 50 },
    { foodId: "avocado", name: "Avocado", grams: 30 },
    { foodId: "salsa-soia", name: "Salsa di soia", grams: 10 },
  ],
  tags: ["high_protein", "meal_prep_friendly"],
  allergens: ["shellfish", "soy"],
  isActive: true,
};

const MAIN_14: MealTemplate = {
  id: "MAIN_14",
  name: "Tagliata di Manzo con Rucola e Grana",
  mealType: "dinner",
  description: "Sliced beef steak with rocket and Grana Padano",
  kcalPerServing: 520,
  proteinG: 50,
  carbsG: 5,
  fatG: 30,
  ingredients: [
    { foodId: "manzo-controfiletto", name: "Controfiletto di manzo", grams: 200 },
    { foodId: "rucola", name: "Rucola", grams: 40 },
    { foodId: "grana-padano", name: "Grana Padano", grams: 20 },
    { foodId: "olio-evo", name: "Olio EVO", grams: 8 },
    { foodId: "limone", name: "Succo di limone", grams: 10 },
  ],
  tags: ["high_protein", "low_carb", "italian"],
  allergens: ["dairy"],
  isActive: true,
};

const MAIN_15: MealTemplate = {
  id: "MAIN_15",
  name: "Pasta al Pesto con Petto di Pollo",
  mealType: "lunch",
  description: "Pesto pasta with diced chicken breast and cherry tomatoes",
  kcalPerServing: 560,
  proteinG: 42,
  carbsG: 58,
  fatG: 16,
  ingredients: [
    { foodId: "pasta-integrale", name: "Pasta integrale", grams: 80 },
    { foodId: "petto-pollo", name: "Petto di pollo", grams: 140 },
    { foodId: "pesto-genovese", name: "Pesto alla genovese", grams: 15 },
    { foodId: "pomodorini", name: "Pomodorini", grams: 60 },
    { foodId: "parmigiano", name: "Parmigiano reggiano", grams: 10 },
  ],
  tags: ["italian", "high_protein", "meal_prep_friendly"],
  allergens: ["gluten", "dairy", "nuts"],
  isActive: true,
};

// ── Exports ─────────────────────────────────────────────────────────────────

/** All 7 breakfast templates */
export const BREAKFAST_TEMPLATES: MealTemplate[] = [
  BKFST_01,
  BKFST_02,
  BKFST_03,
  BKFST_04,
  BKFST_05,
  BKFST_06,
  BKFST_07,
];

/** All 4 snack templates (v4.4.1 updated) */
export const SNACK_TEMPLATES: MealTemplate[] = [
  SNACK_01,
  SNACK_02,
  SNACK_03,
  SNACK_04,
];

/** All 15 main meal templates (MAIN_13/14/15 from Part 11.2) */
export const MAIN_TEMPLATES: MealTemplate[] = [
  MAIN_01,
  MAIN_02,
  MAIN_03,
  MAIN_04,
  MAIN_05,
  MAIN_06,
  MAIN_07,
  MAIN_08,
  MAIN_09,
  MAIN_10,
  MAIN_11,
  MAIN_12,
  MAIN_13,
  MAIN_14,
  MAIN_15,
];

/** All 26 meal templates combined */
export const ALL_TEMPLATES: MealTemplate[] = [
  ...BREAKFAST_TEMPLATES,
  ...SNACK_TEMPLATES,
  ...MAIN_TEMPLATES,
];

/**
 * Get templates by meal type.
 */
export function getTemplatesByType(
  mealType: MealTemplate["mealType"]
): MealTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.mealType === mealType);
}

/**
 * Get a template by ID.
 */
export function getTemplateById(id: string): MealTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}
