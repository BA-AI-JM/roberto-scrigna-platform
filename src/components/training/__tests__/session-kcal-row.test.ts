/**
 * SessionKcalRow — static render: the provisional estimate badge, the override
 * superseding the estimate, and the no-bodyweight fallback.
 */
import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SessionKcalRow } from "../session-kcal-row";

const SESSION = { modality: "Pesi — Forza", duration_min: 60, rpe: 5 };

describe("SessionKcalRow", () => {
  test("renders the provisional estimate badge + the override input", () => {
    const html = renderToStaticMarkup(createElement(SessionKcalRow, { sessionId: "0:0", session: SESSION, bodyweightKg: 80, overrideKcal: null, onOverrideChange: () => {} }));
    expect(html).toContain("240"); // estimate (engine-faithful, No-HR curve)
    expect(html).toContain("stimato");
    expect(html).toContain("kcal personalizzato");
    expect(html).not.toContain("modificato"); // no override yet
  });

  test("an override supersedes the estimate (override primary + 'modificato' + struck estimate)", () => {
    const html = renderToStaticMarkup(createElement(SessionKcalRow, { sessionId: "0:0", session: SESSION, bodyweightKg: 80, overrideKcal: 350, onOverrideChange: () => {} }));
    expect(html).toContain("350 kcal");
    expect(html).toContain("modificato");
    expect(html).toContain("line-through"); // estimate shown struck, not removed
    expect(html).toContain("240");
  });

  test("falls back to n/d when bodyweight is unknown", () => {
    const html = renderToStaticMarkup(createElement(SessionKcalRow, { sessionId: "0:0", session: SESSION, bodyweightKg: null, overrideKcal: null, onOverrideChange: () => {} }));
    expect(html).toContain("kcal stimato: n/d");
  });
});
