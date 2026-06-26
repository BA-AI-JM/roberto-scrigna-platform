/**
 * #27 Stage 2 — Progressi: measurements view + documents list.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { latestMeasurements, MeasurementsView, type MeasurementSnapshot } from "../measurements-view";
import { DocumentsList, type PortalDocument } from "../documents-list";

const SNAPS: MeasurementSnapshot[] = [
  { id: "s2", taken_at: "2026-06-20T00:00:00Z", weight_kg: 78, body_fat_pct: 15, lean_mass_kg: 66, fat_mass_kg: 12 },
  { id: "s1", taken_at: "2026-06-01T00:00:00Z", weight_kg: 80, body_fat_pct: 17, lean_mass_kg: 65, fat_mass_kg: 14 },
];

describe("latestMeasurements", () => {
  test("returns the most recent non-null value per metric", () => {
    expect(latestMeasurements(SNAPS)).toEqual({ weight: 78, bodyFat: 15, lean: 66, fat: 12 });
  });
  test("nulls when no snapshots", () => {
    expect(latestMeasurements([])).toEqual({ weight: null, bodyFat: null, lean: null, fat: null });
  });
});

describe("MeasurementsView render", () => {
  test("renders current body-composition values", () => {
    const html = renderToStaticMarkup(createElement(MeasurementsView, { snapshots: SNAPS, loading: false }));
    expect(html).toContain("Composizione corporea");
    expect(html).toContain("78 kg"); // current weight
    expect(html).toContain("15%"); // current body fat
    expect(html).toContain("Massa magra");
  });
  test("renders empty state when no measurements", () => {
    const html = renderToStaticMarkup(createElement(MeasurementsView, { snapshots: [], loading: false }));
    expect(html).toContain("Nessuna misurazione");
  });
});

const DOCS: PortalDocument[] = [
  {
    id: "doc1",
    title: "Piano Giugno.pdf",
    doc_type: "meal_plan",
    file_url: "https://files.example.com/piano.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 250000,
    created_at: "2026-06-01T10:00:00Z",
  },
];

describe("DocumentsList render", () => {
  test("renders documents with a download link + type label", () => {
    const html = renderToStaticMarkup(createElement(DocumentsList, { documents: DOCS, loading: false }));
    expect(html).toContain("Documenti");
    expect(html).toContain("Piano Giugno.pdf");
    expect(html).toContain('href="https://files.example.com/piano.pdf"');
    expect(html).toContain("Piano alimentare"); // doc_type label
    expect(html).toContain("Scarica");
  });
  test("renders empty state when no documents", () => {
    const html = renderToStaticMarkup(createElement(DocumentsList, { documents: [], loading: false }));
    expect(html).toContain("Nessun documento disponibile");
  });
});
