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

export function MeasurementsView({ snapshots, loading }: { snapshots: MeasurementSnapshot[] | undefined; loading: boolean }) {
  if (loading) {
    return <div style={{ ...cardStyle, color: "#9ca3af", fontSize: "14px" }}>Caricamento misurazioni…</div>;
  }

  const rows = snapshots ?? [];
  if (rows.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px" }}>
        <div style={{ fontSize: "32px", marginBottom: "8px" }} aria-hidden>⚖️</div>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>Nessuna misurazione</p>
        <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0 }}>Le tue misurazioni compariranno qui dopo il primo check-in.</p>
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
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-metric trends */}
      {METRICS.map((metric) => {
        const points = asc
          .filter((s) => typeof s[metric.key] === "number" && s.taken_at)
          .map((s) => ({ date: s.taken_at as string, value: s[metric.key] as number }));
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
