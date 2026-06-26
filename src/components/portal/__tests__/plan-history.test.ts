import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PlanHistoryList, type PlanHistoryVersion } from "../plan-history-section";

const versions: PlanHistoryVersion[] = [
  { id: "p2", versionLabel: "v2", status: "active", isActive: true, createdAt: "2026-06-20T10:00:00Z" },
  { id: "p1", versionLabel: "v1", status: "archived", isActive: false, createdAt: "2026-06-01T10:00:00Z" },
];

describe("PlanHistoryList (getPlanHistory shape)", () => {
  test("renders versions with Italian status badges + active marker; no stub text", () => {
    const html = renderToStaticMarkup(
      createElement(PlanHistoryList, { versions, loading: false, error: false })
    );
    expect(html).toContain("Storico piani");
    expect(html).toContain("v2");
    expect(html).toContain("v1");
    expect(html).toContain("Attivo");
    expect(html).toContain("Archiviato");
    expect(html).toContain("Piano attuale"); // active marker
    expect(html).not.toContain("disponibile a breve");
  });

  test("loading / error / empty states", () => {
    expect(
      renderToStaticMarkup(createElement(PlanHistoryList, { versions: [], loading: true, error: false }))
    ).toContain("Caricamento");
    expect(
      renderToStaticMarkup(createElement(PlanHistoryList, { versions: [], loading: false, error: true }))
    ).toContain("Errore");
    expect(
      renderToStaticMarkup(createElement(PlanHistoryList, { versions: [], loading: false, error: false }))
    ).toContain("Nessun piano");
  });
});
