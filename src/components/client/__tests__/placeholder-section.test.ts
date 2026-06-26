/**
 * #2 Stage-1 — PlaceholderSection (Stage-2 panel stubs: Notifiche, Energia).
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PlaceholderSection } from "../placeholder-section";

describe("PlaceholderSection", () => {
  test("renders the title, the 'disponibile a breve' stub, and the hint", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceholderSection, {
        title: "Notifiche",
        hint: "Avvisi sul cliente.",
      })
    );
    expect(html).toContain("Notifiche");
    expect(html).toContain("Disponibile a breve");
    expect(html).toContain("Avvisi sul cliente.");
  });
});
