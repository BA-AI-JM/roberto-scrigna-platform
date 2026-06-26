/**
 * #27 Stage 1 — active-plan view (full Piano) + compact home summary card.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ActivePlanView, PlanSummaryCard, type ActivePlan } from "../active-plan-view";
import { PortalComingSoon } from "../coming-soon";

const PLAN: ActivePlan = {
  id: "p1",
  name: "Piano Definizione",
  status: "active",
  start_date: "2026-06-01",
  daily_targets: { kcal: 2200, protein_g: 180, carbs_g: 200, fat_g: 70 },
  mealPlan: [
    {
      dayType: "training",
      label: "Giorno di allenamento",
      mealPlan: {
        withinTolerance: true,
        slots: [
          {
            slot: "breakfast",
            primary: {
              template: { name: "Pancake proteici" },
              scaledIngredients: [{ name: "Avena", grams: 80, foodId: "avena" }],
              actualMacros: { kcal: 500, proteinG: 35, carbsG: 60, fatG: 12 },
            },
          },
        ],
      },
    },
  ],
  supplements: [{ name: "Creatina", dosage: "5g", timing: "post-workout" }],
  notes: "Bevi 3L di acqua al giorno.",
};

describe("ActivePlanView (full Piano)", () => {
  test("renders plan name, meals, supplements and coach notes", () => {
    const html = renderToStaticMarkup(createElement(ActivePlanView, { plan: PLAN, loading: false }));
    expect(html).toContain("Piano Definizione");
    expect(html).toContain("I tuoi pasti");
    expect(html).toContain("Pancake proteici");
    expect(html).toContain("Avena");
    expect(html).toContain("Integratori");
    expect(html).toContain("Creatina");
    expect(html).toContain("Note del coach");
    expect(html).toContain("Bevi 3L");
  });

  test("renders an empty state when there's no active plan", () => {
    const html = renderToStaticMarkup(createElement(ActivePlanView, { plan: null, loading: false }));
    expect(html).toContain("Nessun piano attivo");
  });
});

describe("PlanSummaryCard (home)", () => {
  test("renders name + macro pills + a link to the full plan", () => {
    const html = renderToStaticMarkup(createElement(PlanSummaryCard, { plan: PLAN, loading: false }));
    expect(html).toContain("Piano Definizione");
    expect(html).toContain("Kcal 2200");
    expect(html).toContain("Vedi il piano completo");
    expect(html).toContain('href="/portal/plan"');
    // The compact card must NOT inline the full meal list.
    expect(html).not.toContain("I tuoi pasti");
  });
});

describe("PortalComingSoon stub", () => {
  test("renders the title, 'In arrivo' and the description", () => {
    const html = renderToStaticMarkup(
      createElement(PortalComingSoon, { title: "Diario alimentare", icon: "📓", description: "Presto disponibile." })
    );
    expect(html).toContain("Diario alimentare");
    expect(html).toContain("In arrivo");
    expect(html).toContain("Presto disponibile.");
  });
});
