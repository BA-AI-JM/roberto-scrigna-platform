/**
 * #2 Stage-2 — EnergyPanel (per-day-type energy breakdown from client.estimateTdee).
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { EnergyPanel, type EnergyEstimate } from "../energy-panel";

const ESTIMATE: EnergyEstimate = {
  weekSchedule: ["training", "rest"],
  byDayType: [
    {
      dayType: "training",
      bmr: 1700,
      neat: { stepsKcal: 300, occupationalKcal: 200, totalNeatKcal: 500 },
      tef: 250,
      exercise: { exerciseKcal: 450, methodUsed: "session_estimate" },
      totalTdeeKcal: 2900,
    },
    {
      dayType: "rest",
      bmr: 1700,
      neat: { stepsKcal: 150, occupationalKcal: 200, totalNeatKcal: 350 },
      tef: 200,
      exercise: { exerciseKcal: 0, methodUsed: "session_estimate" },
      totalTdeeKcal: 2250,
    },
  ],
};

function render(props: Partial<Parameters<typeof EnergyPanel>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(EnergyPanel, {
      data: ESTIMATE,
      isLoading: false,
      isError: false,
      ...props,
    })
  );
}

describe("EnergyPanel", () => {
  test("renders the per-day-type BMR/NEAT/TEF/EAT/TDEE breakdown", () => {
    const html = render();
    expect(html).toContain("Energia (BMR / NEAT / EAT)");
    expect(html).toContain("Allenamento"); // training day-type label
    expect(html).toContain("Riposo"); // rest day-type label
    expect(html).toContain("BMR");
    expect(html).toContain("1700 kcal");
    expect(html).toContain("NEAT");
    expect(html).toContain("500 kcal"); // training totalNeat
    expect(html).toContain("EAT");
    expect(html).toContain("450 kcal"); // training exercise
    expect(html).toContain("2900 kcal"); // training TDEE
    expect(html).toContain("passi 300 + lavoro 200"); // NEAT composition note
  });

  test("renders the empty state on error (no snapshot → PRECONDITION_FAILED)", () => {
    expect(render({ isError: true })).toContain("Dispendio non disponibile");
  });

  test("renders the empty state when there is no data", () => {
    expect(render({ data: undefined })).toContain("Dispendio non disponibile");
    expect(render({ data: { weekSchedule: [], byDayType: [] } })).toContain(
      "Dispendio non disponibile"
    );
  });

  test("renders the loading state", () => {
    expect(render({ isLoading: true })).toContain("Calcolo del dispendio");
  });
});
