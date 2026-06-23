import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  TrendChart,
  collectDates,
  totalDataPoints,
  seriesExtent,
  tooltipRows,
  type TrendSeries,
} from "../TrendChart";
import { filterByRange, maxTime } from "../ChartControls";

// Helper to build a series with defaults.
function mk(
  over: Partial<TrendSeries> & { points: TrendSeries["points"] }
): TrendSeries {
  return { key: "weight", label: "Peso", color: "#1a1a2e", unit: " kg", ...over };
}

describe("TrendChart — pure helpers", () => {
  test("collectDates unions, sorts ascending, dedupes, drops null/non-finite", () => {
    const s: TrendSeries[] = [
      mk({ points: [{ date: "2026-03-01", value: 80 }, { date: "2026-01-01", value: 82 }] }),
      mk({
        key: "bf",
        label: "Grasso",
        unit: "%",
        points: [
          { date: "2026-02-01", value: 20 },
          { date: "2026-01-01", value: 22 },
          { date: "2026-04-01", value: NaN as unknown as number },
          { date: "2026-05-01", value: null as unknown as number },
        ],
      }),
    ];
    expect(collectDates(s)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(totalDataPoints(s)).toBe(3);
  });

  test("seriesExtent returns [min,max] and pads a flat series; null when empty", () => {
    expect(seriesExtent([{ date: "a", value: 70 }, { date: "b", value: 75 }])).toEqual([70, 75]);
    expect(seriesExtent([{ date: "a", value: 70 }, { date: "b", value: 70 }])).toEqual([69, 71]);
    expect(seriesExtent([])).toBeNull();
  });

  test("tooltipRows: correct value+unit per series for a date, null when absent", () => {
    const s: TrendSeries[] = [
      mk({ points: [{ date: "2026-01-01", value: 80 }, { date: "2026-02-01", value: 78 }] }),
      mk({ key: "bf", label: "Grasso", unit: "%", color: "#dc2626", points: [{ date: "2026-01-01", value: 22 }] }),
    ];
    expect(tooltipRows(s, "2026-01-01")).toEqual([
      { key: "weight", label: "Peso", value: 80, unit: " kg", color: "#1a1a2e" },
      { key: "bf", label: "Grasso", value: 22, unit: "%", color: "#dc2626" },
    ]);
    const later = tooltipRows(s, "2026-02-01");
    expect(later[0]!.value).toBe(78);
    expect(later[1]!.value).toBeNull(); // bf has no point on that date
  });
});

describe("ChartControls — filterByRange (anchored to latest point)", () => {
  const pts = [
    { date: "2026-01-01", value: 1 },
    { date: "2026-02-01", value: 2 },
    { date: "2026-03-01", value: 3 },
  ];
  const anchor = maxTime([mk({ points: pts })]); // 2026-03-01

  test("null days keeps everything", () => {
    expect(filterByRange(pts, null, anchor)).toHaveLength(3);
  });
  test("28-day window drops points older than 4 weeks before the anchor", () => {
    expect(filterByRange(pts, 28, anchor).map((p) => p.date)).toEqual([
      "2026-02-01",
      "2026-03-01",
    ]);
  });
  test("182-day window keeps all three", () => {
    expect(filterByRange(pts, 182, anchor)).toHaveLength(3);
  });
});

describe("TrendChart — render (renderToStaticMarkup, node)", () => {
  test("0 points → empty state, no <svg>, no crash", () => {
    const html = renderToStaticMarkup(createElement(TrendChart, { series: [mk({ points: [] })] }));
    expect(html).toContain("Nessun dato");
    expect(html).not.toContain("<svg");
  });

  test("1 point → single-measurement state, no crash", () => {
    const html = renderToStaticMarkup(
      createElement(TrendChart, { series: [mk({ points: [{ date: "2026-01-01", value: 80 }] })] })
    );
    expect(html).toContain("Prima misurazione");
  });

  test("many points → renders <svg> with a polyline and the series label", () => {
    const html = renderToStaticMarkup(
      createElement(TrendChart, {
        series: [
          mk({ points: [
            { date: "2026-01-01", value: 80 },
            { date: "2026-02-01", value: 78 },
            { date: "2026-03-01", value: 77 },
          ] }),
        ],
      })
    );
    expect(html).toContain("<svg");
    expect(html).toContain("<polyline");
    expect(html).toContain("Peso");
  });

  test("multiple series → one polyline each + both legend labels", () => {
    const html = renderToStaticMarkup(
      createElement(TrendChart, {
        series: [
          mk({ points: [{ date: "2026-01-01", value: 80 }, { date: "2026-02-01", value: 78 }] }),
          mk({ key: "bf", label: "Grasso", unit: "%", color: "#dc2626", lowerIsBetter: true, points: [
            { date: "2026-01-01", value: 22 },
            { date: "2026-02-01", value: 20 },
          ] }),
        ],
      })
    );
    expect((html.match(/<polyline/g) ?? []).length).toBe(2);
    expect(html).toContain("Peso");
    expect(html).toContain("Grasso");
  });
});
