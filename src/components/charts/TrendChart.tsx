"use client";

/**
 * TrendChart — metric-agnostic time-series line chart (zero dependency, inline SVG).
 *
 * Built without a charting library to match this codebase's zero-chart-lib,
 * inline-styled house style and to stay unit-testable in the repo's node-only
 * vitest (the pure helpers below render no DOM). Responsiveness comes from a
 * measured-width pixel coordinate system wrapped in the existing overflowX:auto
 * pattern; interactivity from a pointer/touch hover tooltip.
 *
 * Multiple series are overlaid, each auto-scaled to its OWN min/max range so
 * metrics with very different units (kg vs % vs kcal vs steps) remain
 * shape-comparable; exact values + units are shown in the tooltip and legend.
 *
 * A calorie/macro series (e.g. { key: "kcal", unit: "kcal", points }) plugs in
 * unchanged once a per-day nutrition-log query exists (backend gap — not built).
 */

import { useEffect, useMemo, useRef, useState } from "react";

// ── Public types ───────────────────────────────────────────────────────────────

export interface TrendSeriesPoint {
  date: string;
  value: number;
}

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  unit: string;
  /** When true, a downward trend is the "good" direction (e.g. body fat %). */
  lowerIsBetter?: boolean;
  points: TrendSeriesPoint[];
}

export interface TrendChartProps {
  series: TrendSeries[];
  height?: number;
}

// ── Pure helpers (exported for testing — no DOM required) ────────────────────────

export function parseTime(date: string): number {
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function hasValue(p: TrendSeriesPoint): boolean {
  return p != null && p.date != null && typeof p.value === "number" && Number.isFinite(p.value);
}

/** Sorted-ascending union of all dates that carry a finite value across series. */
export function collectDates(series: TrendSeries[]): string[] {
  const byTime = new Map<number, string>();
  for (const s of series) {
    for (const p of s.points ?? []) {
      if (!hasValue(p)) continue;
      const t = parseTime(p.date);
      if (!byTime.has(t)) byTime.set(t, p.date);
    }
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}

/** Number of distinct dated data points — drives the 0 / 1 / many states. */
export function totalDataPoints(series: TrendSeries[]): number {
  return collectDates(series).length;
}

/** Min/max of a series' finite values; pads a flat series so it doesn't divide by zero. */
export function seriesExtent(points: TrendSeriesPoint[]): [number, number] | null {
  const vals = (points ?? []).filter(hasValue).map((p) => p.value);
  if (vals.length === 0) return null;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  return [lo, hi];
}

/** Tooltip rows for a given date: each series' value at that date (null when absent). */
export function tooltipRows(
  series: TrendSeries[],
  date: string
): { key: string; label: string; value: number | null; unit: string; color: string }[] {
  return series.map((s) => {
    const pt = (s.points ?? []).find((p) => p.date === date && hasValue(p));
    return {
      key: s.key,
      label: s.label,
      value: pt ? pt.value : null,
      unit: s.unit,
      color: s.color,
    };
  });
}

export function formatShortDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

/** Latest finite value of a series (its points are assumed chronological-ascending or not — we scan). */
export function latestValue(s: TrendSeries): number | null {
  const dated = (s.points ?? [])
    .filter(hasValue)
    .sort((a, b) => parseTime(a.date) - parseTime(b.date));
  return dated.length > 0 ? dated[dated.length - 1]!.value : null;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  marginTop: "16px",
  padding: "14px 16px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
};

const DEFAULT_WIDTH = 640;
const PAD = { top: 14, right: 14, bottom: 24, left: 14 };

// ── Component ────────────────────────────────────────────────────────────────

export function TrendChart({ series, height = 220 }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Measure container width for crisp pixel-coordinate rendering (no-op under SSR/jsdom).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dates = useMemo(() => collectDates(series), [series]);

  // ── 0 points ──
  if (dates.length === 0) {
    return (
      <div style={{ ...cardStyle, fontSize: "13px", color: "#9ca3af" }}>
        Nessun dato disponibile per il grafico.
      </div>
    );
  }

  // ── 1 point ── (a single measurement → no trend line; show the value(s))
  if (dates.length === 1) {
    const only = dates[0]!;
    return (
      <div style={{ ...cardStyle, fontSize: "13px", color: "#374151" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "6px" }}>
          {tooltipRows(series, only).map((r) =>
            r.value == null ? null : (
              <span key={r.key}>
                <span style={{ color: r.color, fontWeight: 700 }}>●</span>{" "}
                <span style={{ fontWeight: 600 }}>{r.label}:</span> {r.value}
                {r.unit}
              </span>
            )
          )}
        </div>
        <span style={{ color: "#9ca3af" }}>
          Prima misurazione — andamento disponibile dal prossimo dato.
        </span>
      </div>
    );
  }

  // ── many points ──
  const times = dates.map(parseTime);
  const t0 = times[0]!;
  const t1 = times[times.length - 1]!;
  const span = t1 - t0 || 1;

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = Math.max(1, height - PAD.top - PAD.bottom);

  const xOf = (t: number) => PAD.left + ((t - t0) / span) * plotW;

  const lines = series
    .map((s) => {
      const extent = seriesExtent(s.points);
      if (!extent) return null;
      const [lo, hi] = extent;
      const range = hi - lo || 1;
      const pts = (s.points ?? [])
        .filter(hasValue)
        .slice()
        .sort((a, b) => parseTime(a.date) - parseTime(b.date))
        .map((p) => ({
          x: xOf(parseTime(p.date)),
          y: PAD.top + (1 - (p.value - lo) / range) * plotH,
        }));
      return { key: s.key, color: s.color, pts };
    })
    .filter((l): l is { key: string; color: string; pts: { x: number; y: number }[] } => l != null);

  // Date label positions (first, middle, last) to avoid crowding.
  const labelIdx = Array.from(new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1]));

  function handlePointer(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = rect.width > 0 ? width / rect.width : 1;
    const localX = (clientX - rect.left) * ratio;
    // nearest date by x
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < times.length; i++) {
      const d = Math.abs(xOf(times[i]!) - localX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverDate(dates[best]!);
  }

  const hoverX = hoverDate != null ? xOf(parseTime(hoverDate)) : null;
  const tooltip = hoverDate != null ? tooltipRows(series, hoverDate) : null;
  // keep the tooltip box inside the plot
  const tipLeftPct =
    hoverX != null ? Math.min(85, Math.max(2, (hoverX / width) * 100)) : 0;

  return (
    <div ref={containerRef} style={{ ...cardStyle, position: "relative" }}>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "10px" }}>
        {series.map((s) => {
          const lv = latestValue(s);
          return (
            <span key={s.key} style={{ fontSize: "12px", color: "#374151", display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: s.color, display: "inline-block" }} />
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              {lv != null && (
                <span style={{ color: "#6b7280" }}>
                  {lv}
                  {s.unit}
                </span>
              )}
            </span>
          );
        })}
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ display: "block", maxWidth: "100%", touchAction: "pan-y" }}
          role="img"
          aria-label="Grafico andamento metriche"
          onMouseMove={(e) => handlePointer(e.clientX)}
          onMouseLeave={() => setHoverDate(null)}
          onTouchStart={(e) => e.touches[0] && handlePointer(e.touches[0].clientX)}
          onTouchMove={(e) => e.touches[0] && handlePointer(e.touches[0].clientX)}
        >
          {/* baseline */}
          <line x1={PAD.left} y1={height - PAD.bottom} x2={width - PAD.right} y2={height - PAD.bottom} stroke="#e2e8f0" strokeWidth={1} />

          {/* hover guide */}
          {hoverX != null && (
            <line x1={hoverX} y1={PAD.top} x2={hoverX} y2={height - PAD.bottom} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" />
          )}

          {/* series lines + points */}
          {lines.map((l) => (
            <g key={l.key}>
              <polyline
                fill="none"
                stroke={l.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={l.pts.map((p) => `${p.x},${p.y}`).join(" ")}
              />
              {l.pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={hoverDate != null && xOf(parseTime(hoverDate)) === p.x ? 4 : 2.5} fill={l.color} />
              ))}
            </g>
          ))}

          {/* x-axis date labels */}
          {labelIdx.map((i) => (
            <text key={i} x={Math.min(width - 2, Math.max(2, xOf(times[i]!)))} y={height - 8} textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"} fontSize={10} fill="#9ca3af">
              {formatShortDate(dates[i]!)}
            </text>
          ))}
        </svg>
      </div>

      {/* Tooltip */}
      {hoverDate != null && tooltip != null && (
        <div
          style={{
            position: "absolute",
            left: `${tipLeftPct}%`,
            top: "34px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            padding: "8px 10px",
            fontSize: "12px",
            color: "#374151",
            pointerEvents: "none",
            zIndex: 5,
            minWidth: "120px",
          }}
        >
          <div style={{ fontWeight: 700, color: "#1a1a2e", marginBottom: "4px" }}>{formatShortDate(hoverDate)}</div>
          {tooltip.map((r) => (
            <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: r.color, display: "inline-block" }} />
                {r.label}
              </span>
              <span style={{ fontWeight: 600, color: r.value == null ? "#cbd5e1" : "#1a1a2e" }}>
                {r.value == null ? "—" : `${r.value}${r.unit}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TrendChart;
