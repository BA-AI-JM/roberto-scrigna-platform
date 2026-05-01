/**
 * E2E: Full pipeline + PDF generation for all 3 test fixtures.
 *
 * Tests the complete flow: intake → engine calculation → meal plan →
 * supplement protocol → PDF HTML rendering for Marco Bellini, Niccolo, and Raphael.
 *
 * NOTE: Actual Puppeteer PDF generation is tested via renderReportHtml
 * (synchronous, no browser required) to keep CI fast. The generatePdf
 * function is integration-tested in pdf.test.ts.
 */

import {
  estimateBodyFat,
  calculateTdee,
  generateDailyPlan,
  generateWeeklyPlan,
  type ClientSnapshot,
} from "../../engine/index";
import { renderReportHtml } from "../../pdf/html-renderer";
import type {
  PdfReportData,
  DayTypePlanSummary,
} from "../../pdf/types";
import {
  buildSupplementContext,
  generateSupplementProtocol,
} from "../../services/supplements";
import { createMealPlan } from "../../engine/meal-plan/index";
import { ALL_TEMPLATES } from "../../data/meals/templates";

// ── Fixtures ────────────────────────────────────────────────────────────────

const marco: ClientSnapshot = {
  sex: "male",
  ageYears: 31,
  weightKg: 82,
  heightCm: 178,
  bodyFatPctOverride: 16,
  dailySteps: 8000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

const niccolo: ClientSnapshot = {
  sex: "male",
  ageYears: 28,
  weightKg: 75,
  heightCm: 180,
  bodyFatPctOverride: 14,
  dailySteps: 10000,
  occupationalLevel: "light",
  weekSchedule: ["training", "training", "rest", "training", "rest", "training", "rest"],
};

const raphael: ClientSnapshot = {
  sex: "male",
  ageYears: 35,
  weightKg: 90,
  heightCm: 183,
  bodyFatPctOverride: 18,
  dailySteps: 7000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a complete PdfReportData from a ClientSnapshot for PDF rendering.
 */
function buildReportData(
  snapshot: ClientSnapshot,
  name: string
): PdfReportData {
  const bf = estimateBodyFat(snapshot);
  const weekly = generateWeeklyPlan(snapshot);
  const trainingPlan = generateDailyPlan(snapshot, "training");
  const restPlan = generateDailyPlan(snapshot, "rest");

  // Generate meal plans for both day types
  const trainingMealPlan = createMealPlan(ALL_TEMPLATES, {
    dayType: "training",
    macroTargets: trainingPlan.macros,
    mealCount: 4,
  });

  const restMealPlan = createMealPlan(ALL_TEMPLATES, {
    dayType: "rest",
    macroTargets: restPlan.macros,
    mealCount: 4,
  });

  // Generate supplement protocol
  const suppCtx = buildSupplementContext({
    bodyComposition: bf.bodyComposition,
    snapshot,
    weeklyAverageKcal: weekly.weeklyAverageKcal,
    maintenanceKcal: weekly.weeklyAverageKcal, // maintenance ≈ average for this test
    stileVita: {
      occupation: "Impiegato",
      sleepHours: 7.5,
      stressLevel: 4,
    },
    allenamento: {
      frequencyPerWeek: snapshot.weekSchedule.filter((d) => d === "training").length,
      modalities: ["resistance"],
      experienceYears: 3,
    },
  });
  const supplements = generateSupplementProtocol(suppCtx);

  const dayTypePlans: DayTypePlanSummary[] = [
    {
      dayType: "training",
      label: "Giorno di Allenamento",
      tdee: trainingPlan.tdee,
      macros: trainingPlan.macros,
      hydration: trainingPlan.hydration,
      mealPlan: trainingMealPlan,
    },
    {
      dayType: "rest",
      label: "Giorno di Riposo",
      tdee: restPlan.tdee,
      macros: restPlan.macros,
      hydration: restPlan.hydration,
      mealPlan: restMealPlan,
    },
  ];

  return {
    client: {
      fullName: name,
      planDate: "2026-03-27",
      revision: 1,
    },
    snapshot,
    bodyComposition: bf.bodyComposition,
    dayTypePlans,
    supplements,
    guidance: {
      bodyCompAnalysis: `Analisi composizione corporea per ${name}.`,
      nutritionStrategy: "Strategia nutrizionale personalizzata.",
    },
  };
}

// ── Marco Bellini ───────────────────────────────────────────────────────────

describe("E2E Pipeline: Marco Bellini", () => {
  const report = buildReportData(marco, "Marco Bellini");

  test("engine produces correct TDEE for training and rest", () => {
    expect(report.dayTypePlans[0]!.tdee.totalTdeeKcal).toBe(2627);
    expect(report.dayTypePlans[1]!.tdee.totalTdeeKcal).toBe(2372);
  });

  test("macros match fidelity expectations", () => {
    const t = report.dayTypePlans[0]!.macros;
    expect(t.proteinG).toBe(172);
    expect(t.fatG).toBe(74);
    expect(t.carbG).toBe(318);

    const r = report.dayTypePlans[1]!.macros;
    expect(r.proteinG).toBe(152);
    expect(r.fatG).toBe(82);
    expect(r.carbG).toBe(257);
  });

  test("meal plan generated for both day types", () => {
    expect(report.dayTypePlans[0]!.mealPlan).toBeDefined();
    expect(report.dayTypePlans[1]!.mealPlan).toBeDefined();
    expect(report.dayTypePlans[0]!.mealPlan!.slots.length).toBeGreaterThanOrEqual(3);
    expect(report.dayTypePlans[1]!.mealPlan!.slots.length).toBeGreaterThanOrEqual(3);
  });

  test("supplements include foundation items", () => {
    const names = report.supplements!.map((s) => s.name);
    expect(names).toContain("Proteine Whey Isolate");
    expect(names).toContain("Multivitaminico completo");
    expect(names).toContain("Omega-3 (EPA/DHA)");
    expect(names).toContain("Vitamina D3");
  });

  test("PDF HTML renders without error and contains client name", () => {
    const html = renderReportHtml(report, {
      includeMealPlans: true,
      includeSupplements: true,
      includeGuidance: true,
    });
    expect(html).toContain("Marco Bellini");
    expect(html).toContain("Giorno di Allenamento");
    expect(html).toContain("Giorno di Riposo");
    expect(html.length).toBeGreaterThan(5000);
  });

  test("PDF HTML contains macro values", () => {
    const html = renderReportHtml(report, { includeMealPlans: true });
    expect(html).toContain("172"); // protein training
    // TDEE appears formatted with thousands separator
    expect(html).toContain("2,627");
  });
});

// ── Niccolo ─────────────────────────────────────────────────────────────────

describe("E2E Pipeline: Niccolo", () => {
  const report = buildReportData(niccolo, "Niccolo");

  test("body composition correct", () => {
    expect(report.bodyComposition.bodyFatPct).toBe(14);
    expect(report.bodyComposition.leanMassKg).toBe(64.5);
    expect(report.bodyComposition.fatMassKg).toBe(10.5);
  });

  test("meal plans generated for both day types", () => {
    expect(report.dayTypePlans).toHaveLength(2);
    report.dayTypePlans.forEach((plan) => {
      expect(plan.mealPlan).toBeDefined();
      expect(plan.mealPlan!.slots.length).toBeGreaterThanOrEqual(3);
    });
  });

  test("supplements include creatine (4 training days)", () => {
    const names = report.supplements!.map((s) => s.name);
    expect(names).toContain("Creatina monoidrato");
  });

  test("PDF HTML renders and contains client name", () => {
    const html = renderReportHtml(report);
    expect(html).toContain("Niccolo");
    expect(html.length).toBeGreaterThan(3000);
  });
});

// ── Raphael ─────────────────────────────────────────────────────────────────

describe("E2E Pipeline: Raphael", () => {
  const report = buildReportData(raphael, "Raphael");

  test("body composition correct", () => {
    expect(report.bodyComposition.bodyFatPct).toBe(18);
    expect(report.bodyComposition.leanMassKg).toBe(73.8);
    expect(report.bodyComposition.fatMassKg).toBe(16.2);
  });

  test("macro targets differ between training and rest", () => {
    const t = report.dayTypePlans[0]!.macros;
    const r = report.dayTypePlans[1]!.macros;
    expect(t.proteinG).toBeGreaterThan(r.proteinG);
    expect(r.fatG).toBeGreaterThan(t.fatG);
  });

  test("meal plans have substitutions per slot", () => {
    const mealPlan = report.dayTypePlans[0]!.mealPlan!;
    mealPlan.slots.forEach((slot) => {
      expect(slot.substitutions.length).toBeGreaterThanOrEqual(2);
      expect(slot.substitutions.length).toBeLessThanOrEqual(4);
    });
  });

  test("supplements include foundation + performance items", () => {
    const names = report.supplements!.map((s) => s.name);
    expect(names).toContain("Proteine Whey Isolate");
    expect(names).toContain("Creatina monoidrato");
    expect(names).toContain("Magnesio (bisglicinato)");
  });

  test("PDF HTML renders for Raphael", () => {
    const html = renderReportHtml(report, {
      includeMealPlans: true,
      includeSupplements: true,
      includeGuidance: true,
    });
    expect(html).toContain("Raphael");
    expect(html).toContain("Omega-3");
    expect(html.length).toBeGreaterThan(5000);
  });
});
