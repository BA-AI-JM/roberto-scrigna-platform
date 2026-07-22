/**
 * Tests for the branded PDF report generator.
 * Validates HTML rendering structure, content inclusion, and PDF generation.
 */

import { renderReportHtml } from "../html-renderer";
import { generateCSS, BRAND, DAY_TYPE_COLOURS } from "../styles";
import type { PdfReportData } from "../types";

// ── Test Fixture ────────────────────────────────────────────────────────────

const testReportData: PdfReportData = {
  client: {
    fullName: "Marco Bellini",
    dateOfBirth: "1993-05-15",
    email: "marco@example.com",
    planDate: "2025-01-15",
    revision: 1,
  },
  snapshot: {
    sex: "male",
    ageYears: 31,
    weightKg: 82,
    heightCm: 178,
    bodyFatPctOverride: 16,
    dailySteps: 8000,
    occupationalLevel: "sedentary",
    weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
  },
  bodyComposition: {
    bodyFatPct: 16,
    leanMassKg: 68.88,
    fatMassKg: 13.12,
  },
  circonferenze: {
    collo: 39,
    spalle: 115,
    torace: 100,
    braccioDx: 34,
    braccioSx: 33.5,
    vita: 84,
    fianchi: 98,
    cosciaDx: 58,
    cosciaSx: 57,
  },
  pliche: {
    pettorale: 12,
    ascellare: 14,
    tricipite: 10,
    sottoscapolare: 16,
    addominale: 22,
    sovrailiaca: 18,
    coscia: 15,
  },
  allenamento: {
    frequencyPerWeek: 4,
    modalities: ["Resistance Training", "HIIT"],
    experienceYears: 6,
    currentProgramme: "Upper/Lower Split",
  },
  stileVita: {
    occupation: "Impiegato (ufficio)",
    sleepHours: 7.5,
    currentDiet: "Dieta mediterranea, no tracking",
    allergies: ["Lattosio"],
    stressLevel: 5,
  },
  obiettivo: {
    primaryGoal: "Ricomposizione corporea",
    targetBodyFatPct: 12,
    timelineWeeks: 16,
  },
  monitoring: {
    checkInFrequencyDays: 14,
    metrics: ["Peso", "Circonferenze", "Pliche", "Foto"],
    reassessmentNotes: "Rivalutare macro dopo 4 settimane",
  },
  dayTypePlans: [
    {
      dayType: "training",
      label: "Giorno di Allenamento",
      tdee: {
        bmr: {
          bmrKcal: 1858,
          bodyComposition: { bodyFatPct: 16, leanMassKg: 68.88, fatMassKg: 13.12 },
        },
        neat: { stepsKcal: 328, occupationalKcal: 0, totalNeatKcal: 328 },
        tef: { tefKcal: 244, tefPct: 10 },
        exercise: { exerciseKcal: 255, methodUsed: "default_estimate", recalibrationFactor: 0.85 },
        totalTdeeKcal: 2685,
        dayType: "training",
      },
      macros: { proteinG: 152, fatG: 74, carbG: 283, totalKcal: 2686, dayType: "training" },
      hydration: { waterMl: 3370, saltG: 6.5 },
    },
    {
      dayType: "rest",
      label: "Giorno di Riposo",
      tdee: {
        bmr: {
          bmrKcal: 1858,
          bodyComposition: { bodyFatPct: 16, leanMassKg: 68.88, fatMassKg: 13.12 },
        },
        neat: { stepsKcal: 328, occupationalKcal: 0, totalNeatKcal: 328 },
        tef: { tefKcal: 219, tefPct: 10 },
        exercise: { exerciseKcal: 0, methodUsed: "default_estimate", recalibrationFactor: 0.85 },
        totalTdeeKcal: 2405,
        dayType: "rest",
      },
      macros: { proteinG: 138, fatG: 82, carbG: 230, totalKcal: 2402, dayType: "rest" },
      hydration: { waterMl: 2870, saltG: 5 },
    },
  ],
  supplements: [
    { name: "Creatina Monoidrato", dosage: "5g", timing: "Post-allenamento", rationale: "Forza e recupero" },
    { name: "Vitamina D3", dosage: "4000 UI", timing: "Con colazione" },
    { name: "Omega-3", dosage: "3g EPA/DHA", timing: "Con pasto" },
  ],
  guidance: {
    bodyCompAnalysis:
      "BF% attuale al 16%, buona base di massa magra (68.88 kg). Obiettivo: ridurre a 12% in 16 settimane mantenendo massa muscolare.",
    nutritionStrategy:
      "Deficit moderato nei giorni di riposo, surplus leggero nei giorni di allenamento per supportare la ricomposizione.",
    trainingNotes:
      "Mantenere volume e intensità correnti. Priorità ai movimenti composti.",
  },
};

// ── CSS Tests ───────────────────────────────────────────────────────────────

describe("PDF Styles", () => {
  test("generateCSS returns non-empty stylesheet", () => {
    const css = generateCSS();
    expect(css.length).toBeGreaterThan(100);
    expect(css).toContain("@page");
    expect(css).toContain("font-family");
  });

  test("BRAND colours are valid hex", () => {
    for (const [, value] of Object.entries(BRAND)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("DAY_TYPE_COLOURS has all day types", () => {
    expect(DAY_TYPE_COLOURS).toHaveProperty("training");
    expect(DAY_TYPE_COLOURS).toHaveProperty("rest");
    expect(DAY_TYPE_COLOURS).toHaveProperty("refeed");
    expect(DAY_TYPE_COLOURS).toHaveProperty("deload");
  });
});

// ── HTML Renderer Tests ─────────────────────────────────────────────────────

describe("HTML Renderer", () => {
  test("renders complete HTML document", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"it\">");
    expect(html).toContain("</html>");
  });

  test("includes cover page with client name", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Marco Bellini");
    expect(html).toContain("2025-01-15");
    expect(html).toContain("Roberto Scrigna");
    expect(html).toContain("Revisione 1");
  });

  test("includes patient data section", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Dati Paziente");
    expect(html).toContain("Maschio");
    expect(html).toContain("82.0");
    expect(html).toContain("178.0");
    expect(html).toContain("8,000");
  });

  test("includes circonferenze section", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Circonferenze");
    expect(html).toContain("Vita");
    expect(html).toContain("84.0");
    expect(html).toContain("Fianchi");
    expect(html).toContain("98.0");
  });

  test("includes pliche section", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Pliche");
    expect(html).toContain("Addominale");
    expect(html).toContain("22.0");
  });

  test("includes allenamento section", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Anamnesi Allenamento");
    expect(html).toContain("Resistance Training");
    expect(html).toContain("Upper/Lower Split");
  });

  test("includes stile di vita section", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Stile di Vita");
    expect(html).toContain("Impiegato (ufficio)");
    expect(html).toContain("Lattosio");
  });

  test("includes obiettivo section", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Obiettivo");
    expect(html).toContain("Ricomposizione corporea");
    expect(html).toContain("16 settimane");
  });

  test("includes body comp analysis", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Analisi Composizione Corporea");
    expect(html).toContain("16.0%");
    expect(html).toContain("68.9");
  });

  test("includes monitoring section", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Monitoraggio");
    expect(html).toContain("14 giorni");
    expect(html).toContain("Foto");
  });

  test("includes macro table with all day types", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Riepilogo Macro per Tipologia Giorno");
    expect(html).toContain("Giorno di Allenamento");
    expect(html).toContain("Giorno di Riposo");
    // Macro values
    expect(html).toContain("2,686");
    expect(html).toContain("2,402");
  });

  test("includes day-type plan sections with colour coding", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("day-type-training");
    expect(html).toContain("day-type-rest");
    expect(html).toContain("Allenamento");
  });

  test("includes macro cards per day type", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("macro-card kcal");
    expect(html).toContain("macro-card protein");
    expect(html).toContain("macro-card fat");
    expect(html).toContain("macro-card carbs");
  });

  test("includes TDEE breakdown bars", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("tdee-bar-bmr");
    expect(html).toContain("tdee-bar-neat");
    expect(html).toContain("tdee-bar-tef");
    expect(html).toContain("TDEE: 2,685 kcal");
  });

  test("includes supplement protocol", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Protocollo Integratori");
    expect(html).toContain("Creatina Monoidrato");
    expect(html).toContain("Vitamina D3");
    expect(html).toContain("Omega-3");
  });

  test("includes guidance narratives", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("Indicazioni");
    expect(html).toContain("BF% attuale al 16%");
    expect(html).toContain("Deficit moderato");
  });

  test("renders CSS inline in head", () => {
    const html = renderReportHtml(testReportData);
    expect(html).toContain("<style>");
    expect(html).toContain("@page");
  });

  test("excludes supplements when option is false", () => {
    const html = renderReportHtml(testReportData, { includeSupplements: false });
    expect(html).not.toContain("Protocollo Integratori");
  });

  test("excludes guidance when option is false", () => {
    const html = renderReportHtml(testReportData, { includeGuidance: false });
    expect(html).not.toContain("Indicazioni");
  });

  test("handles minimal data (no optional sections)", () => {
    const minimalData: PdfReportData = {
      client: { fullName: "Test User", planDate: "2025-01-01" },
      snapshot: {
        sex: "male",
        ageYears: 25,
        weightKg: 75,
        heightCm: 175,
        dailySteps: 5000,
        occupationalLevel: "sedentary",
        weekSchedule: ["rest", "rest", "rest", "rest", "rest", "rest", "rest"],
      },
      bodyComposition: { bodyFatPct: 20, leanMassKg: 60, fatMassKg: 15 },
      dayTypePlans: [],
    };
    const html = renderReportHtml(minimalData);
    expect(html).toContain("Test User");
    expect(html).toContain("<!DOCTYPE html>");
    // Should not throw or produce invalid HTML
    expect(html).toContain("</html>");
  });

  test("escapes HTML special characters", () => {
    const data: PdfReportData = {
      ...testReportData,
      client: { ...testReportData.client, fullName: "Test <script>alert('xss')</script>" },
    };
    const html = renderReportHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("page footers include client name and date", () => {
    const html = renderReportHtml(testReportData);
    // Multiple footer instances (one per page)
    const footerCount = (html.match(/page-footer/g) ?? []).length;
    expect(footerCount).toBeGreaterThanOrEqual(3);
  });
});

// ── #18 Peri-workout timed box ───────────────────────────────────────────────

describe("PDF peri-workout timed box (#18)", () => {
  /** testReportData with a training time pinned onto the training day-type. */
  const withTrainingTime: PdfReportData = {
    ...testReportData,
    dayTypePlans: testReportData.dayTypePlans.map((p) =>
      p.dayType === "training" ? { ...p, trainingTime: { startTime: "18:00", endTime: "19:30" } } : p
    ),
  };

  test("renders the timed box + Pre/Intra/Post grouping when a training time exists", () => {
    const html = renderReportHtml(withTrainingTime);
    expect(html).toContain("Timing nutrizionale peri-workout");
    expect(html).toContain("Allenamento 18:00–19:30"); // the timed pill
    expect(html).toContain("Pre-allenamento");
    expect(html).toContain("Intra-allenamento"); // electrolyte guidance prose
    expect(html).toContain("Post-allenamento");
  });

  test("R9: no training time → box still present as plain guidance", () => {
    const html = renderReportHtml(testReportData); // training day, no trainingTime
    expect(html).toContain("Timing nutrizionale peri-workout");
  });

  test("a non-training day never shows the box, even if a time leaks onto it", () => {
    const restWithTime: PdfReportData = {
      ...testReportData,
      dayTypePlans: testReportData.dayTypePlans
        .filter((p) => p.dayType === "rest")
        .map((p) => ({ ...p, trainingTime: { startTime: "18:00", endTime: "19:30" } })),
    };
    const html = renderReportHtml(restWithTime);
    expect(html).not.toContain("Timing nutrizionale peri-workout");
  });
});
