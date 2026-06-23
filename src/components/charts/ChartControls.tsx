"use client";

/**
 * ChartControls — the "customisable" layer over TrendChart.
 *
 * Owns pure-client state for (a) which metrics/series are shown and (b) the
 * time-range window. Filters the supplied series accordingly and renders a
 * TrendChart. No tRPC query — it operates entirely on the series passed in.
 *
 * The range window is anchored to the most-recent data point (not wall-clock
 * "now"), so sparse/older measurement histories still show meaningful windows
 * and the filtering is deterministic (and unit-testable).
 */

import { useMemo, useState } from "react";
import { TrendChart, parseTime, type TrendSeries, type TrendSeriesPoint } from "./TrendChart";

export type RangeKey = "4w" | "12w" | "6m" | "all";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "4w", label: "4 sett.", days: 28 },
  { key: "12w", label: "12 sett.", days: 84 },
  { key: "6m", label: "6 mesi", days: 182 },
  { key: "all", label: "Tutto", days: null },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/** Keep points within `days` before `anchorMs`. `days == null` → keep all. */
export function filterByRange(
  points: TrendSeriesPoint[],
  days: number | null,
  anchorMs: number
): TrendSeriesPoint[] {
  if (days == null) return points;
  const cutoff = anchorMs - days * DAY_MS;
  return (points ?? []).filter((p) => parseTime(p.date) >= cutoff);
}

/** Most-recent timestamp across all series (anchor for range filtering). */
export function maxTime(series: TrendSeries[]): number {
  let max = 0;
  for (const s of series) {
    for (const p of s.points ?? []) {
      const t = parseTime(p.date);
      if (t > max) max = t;
    }
  }
  return max;
}

// ── Styles ───────────────────────────────────────────────────────────────────

function toggleButtonStyle(active: boolean, accent?: string): React.CSSProperties {
  return {
    padding: "5px 11px",
    borderRadius: "16px",
    border: active ? `1.5px solid ${accent ?? "#1a1a2e"}` : "1px solid #d4d4d8",
    background: active ? (accent ? `${accent}1a` : "#1a1a2e") : "#ffffff",
    color: active ? (accent ?? "#ffffff") : "#71717a",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export interface ChartControlsProps {
  series: TrendSeries[];
  height?: number;
  defaultRange?: RangeKey;
  /** Initial selected metric keys; defaults to all series keys. */
  defaultSelected?: string[];
}

export function ChartControls({ series, height, defaultRange = "all", defaultSelected }: ChartControlsProps) {
  const [range, setRange] = useState<RangeKey>(defaultRange);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelected ?? series.map((s) => s.key))
  );

  const anchor = useMemo(() => maxTime(series), [series]);

  const days = RANGES.find((r) => r.key === range)?.days ?? null;

  const filtered = useMemo(
    () =>
      series
        .filter((s) => selected.has(s.key))
        .map((s) => ({ ...s, points: filterByRange(s.points, days, anchor) })),
    [series, selected, days, anchor]
  );

  function toggleMetric(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // keep at least one series visible
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", marginTop: "8px" }}>
        {/* Metric toggle */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {series.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleMetric(s.key)}
              style={toggleButtonStyle(selected.has(s.key), s.color)}
              aria-pressed={selected.has(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* Range toggle */}
        <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              style={toggleButtonStyle(range === r.key)}
              aria-pressed={range === r.key}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <TrendChart series={filtered} height={height} />
    </div>
  );
}

export default ChartControls;
