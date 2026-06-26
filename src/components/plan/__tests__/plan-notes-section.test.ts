/**
 * #3 — PlanNotesSection (the plan narrative editors relocated from the removed
 * "Guida" tab into the Macro tab). Asserts that ALL four coach-authored fields
 * still render (nothing dropped — they all feed the client PDF), plus the
 * relocation heading. Node-env render via renderToStaticMarkup.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PlanNotesSection, PLAN_NOTE_FIELDS } from "../plan-notes-section";
import type { GuidanceSection } from "../../../pdf/types";

const GUIDANCE: GuidanceSection = {
  bodyCompAnalysis: "Analisi della composizione corporea del cliente.",
  nutritionStrategy: "Strategia nutrizionale: deficit moderato.",
  trainingNotes: "Note allenamento: 4 sessioni a settimana.",
  coachNotes: "Note del coach: ottimo lavoro.",
};

function render(guidance: GuidanceSection) {
  return renderToStaticMarkup(
    createElement(PlanNotesSection, {
      guidance,
      onUpdate: () => {},
      textareaStyle: {},
      cardStyle: {},
    })
  );
}

describe("PlanNotesSection — relocated guidance editors (#3)", () => {
  test("renders all four field labels (no coach-authored field dropped)", () => {
    const html = render(GUIDANCE);
    expect(html).toContain("Analisi Composizione Corporea");
    expect(html).toContain("Strategia Nutrizionale");
    expect(html).toContain("Note Allenamento");
    expect(html).toContain("Note del Coach");
  });

  test("renders the relocation heading + PDF orientation note", () => {
    const html = render(GUIDANCE);
    expect(html).toContain("Note e strategia");
    expect(html).toContain("compaiono nel PDF del cliente");
  });

  test("renders the existing guidance values in the textareas", () => {
    const html = render(GUIDANCE);
    expect(html).toContain("Strategia nutrizionale: deficit moderato.");
    expect(html).toContain("Analisi della composizione corporea del cliente.");
    expect(html).toContain("Note del coach: ottimo lavoro.");
  });

  test("renders without throwing when optional fields are absent", () => {
    expect(() =>
      render({ bodyCompAnalysis: "x", nutritionStrategy: "y" } as GuidanceSection)
    ).not.toThrow();
  });

  test("PLAN_NOTE_FIELDS is the exact set of four narrative fields, body-comp included", () => {
    expect(PLAN_NOTE_FIELDS.map((f) => f.key)).toEqual([
      "bodyCompAnalysis",
      "nutritionStrategy",
      "trainingNotes",
      "coachNotes",
    ]);
  });
});
