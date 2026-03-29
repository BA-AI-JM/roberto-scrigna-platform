import {
  ALL_TEMPLATES,
  BREAKFAST_TEMPLATES,
  SNACK_TEMPLATES,
  MAIN_TEMPLATES,
  getTemplatesByType,
  getTemplateById,
} from "../templates";

describe("Meal Templates", () => {
  test("has exactly 26 templates total", () => {
    expect(ALL_TEMPLATES.length).toBe(26);
  });

  test("has 7 breakfast templates", () => {
    expect(BREAKFAST_TEMPLATES.length).toBe(7);
    BREAKFAST_TEMPLATES.forEach((t) => expect(t.mealType).toBe("breakfast"));
  });

  test("has 4 snack templates", () => {
    expect(SNACK_TEMPLATES.length).toBe(4);
    SNACK_TEMPLATES.forEach((t) => expect(t.mealType).toBe("snack"));
  });

  test("has 15 main meal templates", () => {
    expect(MAIN_TEMPLATES.length).toBe(15);
    MAIN_TEMPLATES.forEach((t) =>
      expect(["lunch", "dinner"]).toContain(t.mealType)
    );
  });

  test("all template IDs are unique", () => {
    const ids = ALL_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("all templates have valid macro values", () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.kcalPerServing).toBeGreaterThan(0);
      expect(t.proteinG).toBeGreaterThanOrEqual(0);
      expect(t.carbsG).toBeGreaterThanOrEqual(0);
      expect(t.fatG).toBeGreaterThanOrEqual(0);
    }
  });

  test("all templates have at least one ingredient", () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.ingredients.length).toBeGreaterThan(0);
    }
  });

  test("all templates are active", () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.isActive).toBe(true);
    }
  });

  test("MAIN_13/14/15 from Part 11.2 exist", () => {
    expect(getTemplateById("MAIN_13")).toBeDefined();
    expect(getTemplateById("MAIN_14")).toBeDefined();
    expect(getTemplateById("MAIN_15")).toBeDefined();
  });

  test("getTemplatesByType returns correct count", () => {
    expect(getTemplatesByType("breakfast").length).toBe(7);
    expect(getTemplatesByType("snack").length).toBe(4);
    expect(getTemplatesByType("lunch").length).toBe(8);
    expect(getTemplatesByType("dinner").length).toBe(7);
  });

  test("getTemplateById returns correct template", () => {
    const t = getTemplateById("BKFST_01");
    expect(t).toBeDefined();
    expect(t!.name).toContain("Porridge");
  });

  test("getTemplateById returns undefined for unknown ID", () => {
    expect(getTemplateById("UNKNOWN_99")).toBeUndefined();
  });

  test("breakfast IDs follow naming convention", () => {
    BREAKFAST_TEMPLATES.forEach((t) =>
      expect(t.id).toMatch(/^BKFST_\d{2}$/)
    );
  });

  test("snack IDs follow naming convention", () => {
    SNACK_TEMPLATES.forEach((t) => expect(t.id).toMatch(/^SNACK_\d{2}$/));
  });

  test("main IDs follow naming convention", () => {
    MAIN_TEMPLATES.forEach((t) => expect(t.id).toMatch(/^MAIN_\d{2}$/));
  });

  test("ingredients have positive gram values", () => {
    for (const t of ALL_TEMPLATES) {
      for (const ing of t.ingredients) {
        expect(ing.grams).toBeGreaterThan(0);
        expect(ing.name.length).toBeGreaterThan(0);
        expect(ing.foodId.length).toBeGreaterThan(0);
      }
    }
  });

  test("v4.4.1 snack updates — SNACK_03 is post-workout", () => {
    const snack03 = getTemplateById("SNACK_03")!;
    expect(snack03.tags).toContain("post_workout");
    expect(snack03.proteinG).toBeGreaterThanOrEqual(30);
  });
});
