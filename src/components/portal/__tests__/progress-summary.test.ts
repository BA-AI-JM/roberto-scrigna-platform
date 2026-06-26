/**
 * #27 Stage 1 — progress strip: compute helper + render.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { computeProgressSummary, GoalsStrip } from "../progress-summary";

describe("computeProgressSummary", () => {
  test("derives starting (earliest) + current (latest) + delta across snapshots", () => {
    const snaps = [
      { taken_at: "2026-06-20T10:00:00Z", weight_kg: 78 }, // newest-first (as the query returns)
      { taken_at: "2026-06-01T10:00:00Z", weight_kg: 80 },
    ];
    expect(computeProgressSummary(snaps, [])).toEqual({
      startingWeight: 80,
      currentWeight: 78,
      deltaKg: -2,
    });
  });

  test("merges check-in trend weights with snapshots chronologically", () => {
    const snaps = [{ taken_at: "2026-06-25T10:00:00Z", weight_kg: 77 }];
    const trend = [
      { check_in_date: "2026-05-01", weight_kg: 82, nutrition_adherence: null, training_adherence: null },
    ];
    const r = computeProgressSummary(snaps, trend as never);
    expect(r.startingWeight).toBe(82); // May check-in is earliest
    expect(r.currentWeight).toBe(77); // June snapshot is latest
    expect(r.deltaKg).toBe(-5);
  });

  test("returns nulls when there are no weights", () => {
    expect(computeProgressSummary([], [])).toEqual({
      startingWeight: null,
      currentWeight: null,
      deltaKg: null,
    });
    expect(computeProgressSummary(undefined, undefined)).toEqual({
      startingWeight: null,
      currentWeight: null,
      deltaKg: null,
    });
  });
});

describe("GoalsStrip render", () => {
  test("renders current/starting/variation/last-check-in", () => {
    const html = renderToStaticMarkup(
      createElement(GoalsStrip, {
        summary: { currentWeight: 78, startingWeight: 80, deltaKg: -2 },
        latestCheckInDate: "2026-06-20T10:00:00Z",
        loading: false,
      })
    );
    expect(html).toContain("78 kg");
    expect(html).toContain("80 kg");
    expect(html).toContain("-2.0 kg");
    expect(html).toContain("Peso attuale");
    expect(html).toContain("Ultimo check-in");
  });

  test("renders a loading state", () => {
    const html = renderToStaticMarkup(
      createElement(GoalsStrip, {
        summary: { currentWeight: null, startingWeight: null, deltaKg: null },
        latestCheckInDate: null,
        loading: true,
      })
    );
    expect(html).toContain("Caricamento progressi");
  });
});
