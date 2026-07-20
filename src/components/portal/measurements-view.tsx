"use client";

/**
 * #27 Stage 2 — body composition + measurements for the "Progressi" tab, from
 * portal.getSnapshots (weight, body fat %, lean mass, fat mass). Current values
 * + a trend chart per metric (≥2 points). Presentational; the page owns the query.
 *
 * NOTE: getSnapshots does not currently return waist/hip nor the photo_*_url
 * fields, so those aren't shown here (see the page's "in arrivo" photo note).
 */

import { TrendChart, totalDataPoints, type TrendSeries } from "@/components/charts/TrendChart";

export interface MeasurementSnapshot {
  id: string;
  taken_at: string | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
}

export interface LatestMeasurements {
  weight: number | null;
  bodyFat: number | null;
  lean: number | null;
  fat: number | null;
}

/** Most recent non-null value per metric (snapshots arrive newest-first). */
export function latestMeasurements(snapshots: MeasurementSnapshot[] | undefined): LatestMeasurements {
  const first = <K extends keyof MeasurementSnapshot>(key: K): number | null => {
    for (const s of snapshots ?? []) {
      const v = s[key];
      if (typeof v === "number") return v;
    }
    return null;
  };
  return { weight: first("weight_kg"), bodyFat: first("body_fat_pct"), lean: first("lean_mass_kg"), fat: first("fat_mass_kg") };
}

const METRICS: { key: keyof MeasurementSnapshot; label: string; unit: string; color: string }[] = [
  { key: "weight_kg", label: "Peso", unit: " kg", color: "#1a1a2e" },
  { key: "body_fat_pct", label: "Massa grassa", unit: "%", color: "#ef4444" },
  { key: "lean_mass_kg", label: "Massa magra", unit: " kg", color: "#16a34a" },
  { key: "fat_mass_kg", label: "Grasso (kg)", unit: " kg", color: "#f59e0b" },
];

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "20px",
  marginBottom: "16px",
};

export function MeasurementsView({
  snapshots,
  loading,
  checkinWeightPoints,
}: {
  snapshots: MeasurementSnapshot[] | undefined;
  loading: boolean;
  /** Completed check-in weights, merged into the Peso trend (same source the
   *  portal dashboard chart uses) — snapshots alone collapse the trend to a
   *  single point for clients who weigh in via check-in. */
  checkinWeightPoints?: { date: string; value: number }[];
}) {
  if (loading) {
    return <div style={{ ...cardStyle, color: "#6b7280", fontSize: "14px" }}>Caricamento misurazioni…</div>;
  }

  const rows = snapshots ?? [];
  if (rows.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px" }}>
        <div style={{ fontSize: "32px", marginBottom: "8px" }} aria-hidden>⚖️</div>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>Nessuna misurazione</p>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>Le tue misurazioni compariranno qui dopo il primo check-in.</p>
      </div>
    );
  }

  const latest = latestMeasurements(rows);
  // Ascending for the charts.
  const asc = [...rows].reverse();

  return (
    <div>
      {/* Current values */}
      <div style={{ ...cardStyle }}>
        <p style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 14px" }}>Composizione corporea</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {[
            { label: "Peso", value: latest.weight, unit: " kg" },
            { label: "Massa grassa", value: latest.bodyFat, unit: "%" },
            { label: "Massa magra", value: latest.lean, unit: " kg" },
            { label: "Grasso", value: latest.fat, unit: " kg" },
          ].map((m) => (
            <div key={m.label} style={{ flex: "1 1 90px", minWidth: "80px", textAlign: "center", padding: "12px 8px", background: "#f8fafc", borderRadius: "10px" }}>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a2e" }}>{m.value != null ? `${m.value}${m.unit}` : "—"}</div>
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-metric trends */}
      {METRICS.map((metric) => {
        const base = asc
          .filter((s) => typeof s[metric.key] === "number" && s.taken_at)
          .map((s) => ({ date: s.taken_at as string, value: s[metric.key] as number }));
        // Peso merges check-in weights too — dedupe by day, latest timestamp
        // wins (snapshot beats check-in on ties), matching the dashboard chart.
        let points = base;
        if (metric.key === "weight_kg" && checkinWeightPoints?.length) {
          const byDay = new Map<string, { date: string; value: number; t: number }>();
          for (const p of [...checkinWeightPoints, ...base]) {
            if (!p.date) continue;
            const t = new Date(p.date).getTime();
            if (Number.isNaN(t)) continue;
            const day = p.date.slice(0, 10);
            const existing = byDay.get(day);
            if (!existing || t >= existing.t) byDay.set(day, { ...p, t });
          }
          points = [...byDay.values()].sort((a, b) => a.t - b.t).map(({ date, value }) => ({ date, value }));
        }
        const series: TrendSeries[] = [{ key: String(metric.key), label: metric.label, color: metric.color, unit: metric.unit, points }];
        if (totalDataPoints(series) < 2) return null;
        return (
          <div key={String(metric.key)} style={cardStyle}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280", marginBottom: "4px" }}>Andamento {metric.label.toLowerCase()}</p>
            <TrendChart series={series} height={180} />
          </div>
        );
      })}
    </div>
  );
}
