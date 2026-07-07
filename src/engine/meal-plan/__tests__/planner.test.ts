import { createMealPlan } from "../planner";
import { calculateScaleFactor, scaleMealToTarget } from "../scaler";
import { filterMeals, scoreMeal, selectMeals } from "../selector";
import { generateSubstitutions } from "../substitution";
import { applyFatCompensation } from "../fat-compensation";
import { getDistribution, DISTRIBUTION_TEMPLATES } from "../distribution";
import { SCALE_BOUNDS } from "../types";
import type {
  MealTemplate,
  MealPlanConfig,
  SlotMacroTargets,
  MealSlot,
} from "../types";
import type { MacroTargets } from "../../types";
import { ALL_TEMPLATES } from "../../../data/meals/templates";

// ── Test fixtures ───────────────────────────────────────────────────────────

const TRAINING_MACROS: MacroTargets = {
  proteinG: 180,
  fatG: 72,
  carbG: 280,
  totalKcal: 2500,
  dayType: "training",
};

const REST_MACROS: MacroTargets = {
  proteinG: 160,
  fatG: 80,
  carbG: 200,
  totalKcal: 2150,
  dayType: "rest",
};

// ── Distribution tests ──────────────────────────────────────────────────────

describe("Distribution Templates", () => {
  test("has templates for 3-6 meals", () => {
    expect(DISTRIBUTION_TEMPLATES[3]).toBeDefined();
    expect(DISTRIBUTION_TEMPLATES[4]).toBeDefined();
    expect(DISTRIBUTION_TEMPLATES[5]).toBeDefined();
    expect(DISTRIBUTION_TEMPLATES[6]).toBeDefined();
  });

  test("slot fractions sum to ~1.0 for each template", () => {
    for (const count of [3, 4, 5, 6]) {
      const dist = DISTRIBUTION_TEMPLATES[count]!;
      const kcalSum = dist.slots.reduce((s, slot) => s + slot.kcalFraction, 0);
      expect(kcalSum).toBeCloseTo(1.0, 1);
    }
  });

  test("getDistribution clamps to valid range", () => {
    expect(getDistribution(2).mealCount).toBe(3);
    expect(getDistribution(7).mealCount).toBe(6);
    expect(getDistribution(4).mealCount).toBe(4);
  });

  test("each slot has valid meal types", () => {
    for (const count of [3, 4, 5, 6]) {
      const dist = DISTRIBUTION_TEMPLATES[count]!;
      for (const slot of dist.slots) {
        expect(slot.validTypes.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── Selector tests ──────────────────────────────────────────────────────────

describe("Meal Selector", () => {
  test("filters by meal type", () => {
    const breakfasts = filterMeals(ALL_TEMPLATES, {
      validTypes: ["breakfast"],
      excludeAllergens: [],
      preferTags: [],
      excludeIds: [],
    });
    expect(breakfasts.length).toBe(7);
    breakfasts.forEach((t) => expect(t.mealType).toBe("breakfast"));
  });

  test("filters by allergens", () => {
    const dairyFree = filterMeals(ALL_TEMPLATES, {
      validTypes: ["breakfast"],
      excludeAllergens: ["dairy"],
      preferTags: [],
      excludeIds: [],
    });
    dairyFree.forEach((t) => expect(t.allergens).not.toContain("dairy"));
  });

  test("excludes specific IDs", () => {
    const result = filterMeals(ALL_TEMPLATES, {
      validTypes: ["breakfast"],
      excludeAllergens: [],
      preferTags: [],
      excludeIds: ["BKFST_01", "BKFST_02"],
    });
    result.forEach((t) => {
      expect(t.id).not.toBe("BKFST_01");
      expect(t.id).not.toBe("BKFST_02");
    });
  });

  test("scores meals — closer to target = lower score", () => {
    const target: SlotMacroTargets = {
      kcal: 420,
      proteinG: 35,
      fatG: 8,
      carbsG: 50,
    };

    // BKFST_01 matches exactly
    const bkfst01 = ALL_TEMPLATES.find((t) => t.id === "BKFST_01")!;
    const score = scoreMeal(bkfst01, target, []);
    expect(score).toBeLessThan(0.1);
  });

  test("selectMeals returns sorted results", () => {
    const target: SlotMacroTargets = {
      kcal: 500,
      proteinG: 40,
      fatG: 12,
      carbsG: 55,
    };

    const results = selectMeals(
      ALL_TEMPLATES,
      target,
      {
        validTypes: ["lunch", "dinner"],
        excludeAllergens: [],
        preferTags: [],
        excludeIds: [],
      },
      3
    );

    expect(results.length).toBe(3);
    // Scores should be ascending
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeGreaterThanOrEqual(results[i - 1]!.score);
    }
  });
});

// ── Scaler tests ────────────────────────────────────────────────────────────

describe("Ingredient Scaler", () => {
  test("calculates scale factor within bounds", () => {
    const template = ALL_TEMPLATES[0]!;
    const target: SlotMacroTargets = {
      kcal: 600,
      proteinG: 50,
      fatG: 12,
      carbsG: 70,
    };

    const factor = calculateScaleFactor(template, target);
    expect(factor).toBeGreaterThanOrEqual(SCALE_BOUNDS.min);
    expect(factor).toBeLessThanOrEqual(SCALE_BOUNDS.max);
  });

  test("scaleMealToTarget produces valid SelectedMeal", () => {
    const template = ALL_TEMPLATES[0]!;
    const target: SlotMacroTargets = {
      kcal: 500,
      proteinG: 40,
      fatG: 10,
      carbsG: 60,
    };

    const selected = scaleMealToTarget(template, target);
    expect(selected.scaleFactor).toBeGreaterThanOrEqual(SCALE_BOUNDS.min);
    expect(selected.scaleFactor).toBeLessThanOrEqual(SCALE_BOUNDS.max);
    expect(selected.scaledIngredients.length).toBe(
      template.ingredients.length
    );
    expect(selected.actualMacros.kcal).toBeGreaterThan(0);
    expect(selected.actualMacros.proteinG).toBeGreaterThan(0);
  });

  test("scaling factor 1.0 preserves original macros", () => {
    const template = ALL_TEMPLATES[0]!;
    const target: SlotMacroTargets = {
      kcal: template.kcalPerServing,
      proteinG: template.proteinG,
      fatG: template.fatG,
      carbsG: template.carbsG,
    };

    const factor = calculateScaleFactor(template, target);
    expect(factor).toBeCloseTo(1.0, 1);
  });
});

// ── Substitution tests ──────────────────────────────────────────────────────

describe("Substitutions", () => {
  test("generates 2-4 substitutions", () => {
    const target: SlotMacroTargets = {
      kcal: 500,
      proteinG: 40,
      fatG: 12,
      carbsG: 55,
    };

    const subs = generateSubstitutions({
      templates: ALL_TEMPLATES,
      primaryId: "MAIN_01",
      target,
      validTypes: ["lunch", "dinner"],
      excludeAllergens: [],
      preferTags: [],
      count: 3,
    });

    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(subs.length).toBeLessThanOrEqual(4);
    subs.forEach((s) => expect(s.template.id).not.toBe("MAIN_01"));
  });

  test("substitutions respect allergen filters", () => {
    const target: SlotMacroTargets = {
      kcal: 500,
      proteinG: 40,
      fatG: 15,
      carbsG: 50,
    };

    const subs = generateSubstitutions({
      templates: ALL_TEMPLATES,
      primaryId: "MAIN_01",
      target,
      validTypes: ["lunch", "dinner"],
      excludeAllergens: ["fish"],
      preferTags: [],
      count: 3,
    });

    subs.forEach((s) =>
      expect(s.template.allergens).not.toContain("fish")
    );
  });

  test("count is clamped to 2-4", () => {
    const target: SlotMacroTargets = {
      kcal: 400,
      proteinG: 30,
      fatG: 10,
      carbsG: 40,
    };

    const subs = generateSubstitutions({
      templates: ALL_TEMPLATES,
      primaryId: "BKFST_01",
      target,
      validTypes: ["breakfast"],
      excludeAllergens: [],
      preferTags: [],
      count: 10,
    });

    expect(subs.length).toBeLessThanOrEqual(4);
  });
});

// ── Fat Compensation tests ──────────────────────────────────────────────────

describe("Fat Compensation", () => {
  test("no compensation when fat is within 5g", () => {
    const slots: MealSlot[] = [
      {
        slot: "breakfast",
        targetMacros: { kcal: 500, proteinG: 40, fatG: 15, carbsG: 50 },
        primary: {
          template: ALL_TEMPLATES[0]!,
          scaleFactor: 1.0,
          scaledIngredients: [],
          actualMacros: { kcal: 500, proteinG: 40, fatG: 18, carbsG: 50 },
        },
        substitutions: [],
      },
    ];

    const result = applyFatCompensation(slots);
    expect(result.fatRedistributedG).toBe(0);
  });

  test("redistributes fat excess across other slots", () => {
    const slots: MealSlot[] = [
      {
        slot: "lunch",
        targetMacros: { kcal: 600, proteinG: 45, fatG: 15, carbsG: 60 },
        primary: {
          template: ALL_TEMPLATES[0]!,
          scaleFactor: 1.0,
          scaledIngredients: [],
          actualMacros: { kcal: 650, proteinG: 45, fatG: 28, carbsG: 60 },
        },
        substitutions: [],
      },
      {
        slot: "dinner",
        targetMacros: { kcal: 600, proteinG: 45, fatG: 20, carbsG: 55 },
        primary: {
          template: ALL_TEMPLATES[0]!,
          scaleFactor: 1.0,
          scaledIngredients: [],
          actualMacros: { kcal: 600, proteinG: 45, fatG: 20, carbsG: 55 },
        },
        substitutions: [],
      },
    ];

    const result = applyFatCompensation(slots);
    expect(result.fatRedistributedG).toBeGreaterThan(0);
    // Dinner's fat target should be reduced
    expect(result.adjustedTargets[1]!.fatG).toBeLessThan(20);
  });
});

// ── Full Planner tests ──────────────────────────────────────────────────────

describe("Meal Plan Creator", () => {
  test("creates a valid 4-meal training plan", () => {
    const config: MealPlanConfig = {
      dayType: "training",
      macroTargets: TRAINING_MACROS,
      mealCount: 4,
      substitutionsPerSlot: 3,
    };

    const plan = createMealPlan(ALL_TEMPLATES, config);

    expect(plan.dayType).toBe("training");
    expect(plan.slots.length).toBe(4);
    expect(plan.actualMacros.kcal).toBeGreaterThan(0);
    expect(plan.actualMacros.proteinG).toBeGreaterThan(0);
  });

  test("each slot has primary and substitutions", () => {
    const config: MealPlanConfig = {
      dayType: "training",
      macroTargets: TRAINING_MACROS,
      mealCount: 4,
      substitutionsPerSlot: 3,
    };

    const plan = createMealPlan(ALL_TEMPLATES, config);

    for (const slot of plan.slots) {
      expect(slot.primary).toBeDefined();
      // Stage 2: meals are assembled by per-ingredient gram solving; the legacy
      // whole-meal scaleFactor is no longer populated. Validate solved output.
      expect(slot.primary.scaledIngredients.length).toBeGreaterThan(0);
      expect(slot.primary.scaledIngredients.every((i) => i.grams > 0)).toBe(true);
      expect(slot.primary.actualMacros.kcal).toBeGreaterThan(0);
      expect(slot.substitutions.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("creates valid 3-meal rest plan", () => {
    const config: MealPlanConfig = {
      dayType: "rest",
      macroTargets: REST_MACROS,
      mealCount: 3,
    };

    const plan = createMealPlan(ALL_TEMPLATES, config);

    expect(plan.slots.length).toBe(3);
    expect(plan.dayType).toBe("rest");
  });

  test("creates valid 5-meal plan", () => {
    const config: MealPlanConfig = {
      dayType: "training",
      macroTargets: TRAINING_MACROS,
      mealCount: 5,
    };

    const plan = createMealPlan(ALL_TEMPLATES, config);
    expect(plan.slots.length).toBe(5);
  });

  test("respects allergen exclusions", () => {
    const config: MealPlanConfig = {
      dayType: "training",
      macroTargets: TRAINING_MACROS,
      mealCount: 4,
      excludeAllergens: ["fish", "shellfish"],
    };

    const plan = createMealPlan(ALL_TEMPLATES, config);

    for (const slot of plan.slots) {
      expect(slot.primary.template.allergens).not.toContain("fish");
      expect(slot.primary.template.allergens).not.toContain("shellfish");
    }
  });

  test("deviation is calculated correctly", () => {
    const config: MealPlanConfig = {
      dayType: "training",
      macroTargets: TRAINING_MACROS,
      mealCount: 4,
    };

    const plan = createMealPlan(ALL_TEMPLATES, config);

    // Deviation should be actual - target
    expect(plan.deviation.kcal).toBe(
      plan.actualMacros.kcal - TRAINING_MACROS.totalKcal
    );
  });

  test("plan has withinTolerance flag", () => {
    const config: MealPlanConfig = {
      dayType: "training",
      macroTargets: TRAINING_MACROS,
      mealCount: 4,
    };

    const plan = createMealPlan(ALL_TEMPLATES, config);
    expect(typeof plan.withinTolerance).toBe("boolean");
  });
});
