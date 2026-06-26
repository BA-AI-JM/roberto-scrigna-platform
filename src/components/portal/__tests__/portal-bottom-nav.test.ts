/**
 * #27 Stage 1 — portal bottom-tab nav: tab config, active-matcher, render.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  PORTAL_NAV_TABS,
  isTabActive,
  BottomNavBar,
} from "../portal-bottom-nav";

describe("PORTAL_NAV_TABS", () => {
  test("exposes the four mobile tabs in order with Italian labels + routes", () => {
    expect(PORTAL_NAV_TABS.map((t) => [t.label, t.href])).toEqual([
      ["Home", "/portal/dashboard"],
      ["Piano", "/portal/plan"],
      ["Diario", "/portal/diary"],
      ["Progressi", "/portal/progress"],
    ]);
  });
});

describe("isTabActive", () => {
  test("matches exact path and nested paths, not siblings", () => {
    expect(isTabActive("/portal/dashboard", "/portal/dashboard")).toBe(true);
    expect(isTabActive("/portal/plan/x", "/portal/plan")).toBe(true);
    expect(isTabActive("/portal/plan", "/portal/dashboard")).toBe(false);
    expect(isTabActive(null, "/portal/plan")).toBe(false);
    expect(isTabActive(undefined, "/portal/plan")).toBe(false);
  });
});

describe("BottomNavBar render", () => {
  test("renders all four tabs with links and marks the active one", () => {
    const html = renderToStaticMarkup(
      createElement(BottomNavBar, { pathname: "/portal/dashboard" })
    );
    for (const t of PORTAL_NAV_TABS) {
      expect(html).toContain(t.label);
      expect(html).toContain(`href="${t.href}"`);
    }
    expect(html).toContain('aria-current="page"'); // active tab marked
  });
});
