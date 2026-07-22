/**
 * WeekSessionsEditor — static render of the Phase-2 collapsed picker and the
 * whole-session RPE framing. Uses renderToStaticMarkup (node env), same pattern
 * as session-kcal-row.test.ts.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { WeekSessionsEditor, type WeekSessions } from "../week-sessions-editor";

const render = (value: WeekSessions) =>
  renderToStaticMarkup(
    createElement(WeekSessionsEditor, { value, onChange: () => {}, bodyweightKg: 80 })
  );

describe("WeekSessionsEditor — collapsed picker + whole-session RPE", () => {
  it("shows collapsed sport labels and NOT the retired sub-types", () => {
    const html = render({ 0: [{ modality: "BJJ — Classe", duration_min: 90, rpe: 7 }] });
    expect(html).toContain(">BJJ</option>"); // clean label
    expect(html).not.toContain("BJJ — Sparring"); // retired sub-type gone from options
    expect(html).not.toContain("BJJ — Drill");
  });

  it("frames RPE as the whole session with its spec-§6 descriptor", () => {
    const html = render({ 0: [{ modality: "BJJ — Classe", duration_min: 90, rpe: 7 }] });
    expect(html).toContain("RPE 7: Impegnativa");
    expect(html).toContain("incluse pause e recupero");
  });

  it("renders the correct descriptor at another RPE", () => {
    const html = render({ 0: [{ modality: "Kickboxing", duration_min: 60, rpe: 10 }] });
    expect(html).toContain("RPE 10: Massimale / gara");
  });

  it("displays a legacy sub-type session as its collapsed option", () => {
    // Stored "BJJ — Sparring" must still show the BJJ option (mapped to the rep),
    // never a broken/blank select.
    const html = render({ 0: [{ modality: "BJJ — Sparring", duration_min: 60, rpe: 8 }] });
    expect(html).toContain(">BJJ</option>");
    expect(html).toContain("RPE 8: Molto impegnativa");
  });

  it("computes Ora fine from start + duration, read-only (only the start is an input)", () => {
    const html = render({
      0: [{ modality: "BJJ — Classe", duration_min: 90, rpe: 7, startTime: "20:30" }],
    });
    expect(html).toContain("Ora fine (calcolata)");
    expect(html).toContain("22:00"); // 20:30 + 90 min
    // exactly one time input remains (start); end is a computed display, not an input
    expect((html.match(/type="time"/g) ?? []).length).toBe(1);
  });
});
