"use client";

/**
 * #27 Stage 1 — progress strip for the patient home. Surfaces current weight vs
 * starting weight (+ delta) and the latest check-in date, computed ONLY from
 * data the existing queries already return (getSnapshots weights + the dashboard
 * check-in weight trend). No backend.
 */

export interface WeightPoint {
  date: string | null | undefined;
  weight: number | null | undefined;
}

export interface ProgressSummary {
  currentWeight: number | null;
  startingWeight: number | null;
  deltaKg: number | null;
}

/**
 * Merge every weight reading (client snapshots + check-in trend) by chronology
 * and derive starting (earliest) + current (latest) + delta. Null-safe; returns
 * nulls when there are no weights.
 */
export function computeProgressSummary(
  snapshots: Array<{ taken_at: string | null; weight_kg: number | null }> | undefined,
  weightTrend: Array<{ check_in_date: string; weight_kg: number | null }> | undefined
): ProgressSummary {
  const points: { t: number; weight: number }[] = [];
  for (const s of snapshots ?? []) {
    if (s.weight_kg == null || !s.taken_at) continue;
    const t = new Date(s.taken_at).getTime();
    if (!Number.isNaN(t)) points.push({ t, weight: s.weight_kg });
  }
  for (const e of weightTrend ?? []) {
    if (e.weight_kg == null || !e.check_in_date) continue;
    const t = new Date(e.check_in_date).getTime();
    if (!Number.isNaN(t)) points.push({ t, weight: e.weight_kg });
  }
  if (points.length === 0) return { currentWeight: null, startingWeight: null, deltaKg: null };
  points.sort((a, b) => a.t - b.t);
  const startingWeight = points[0]!.weight;
  const currentWeight = points[points.length - 1]!.weight;
  const deltaKg = Math.round((currentWeight - startingWeight) * 10) / 10;
  return { currentWeight, startingWeight, deltaKg };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

export function GoalsStrip({
  summary,
  latestCheckInDate,
  loading,
}: {
  summary: ProgressSummary;
  latestCheckInDate: string | null | undefined;
  loading: boolean;
}) {
  const shell: React.CSSProperties = {
    background: "#1a1a2e",
    borderRadius: "14px",
    padding: "8px",
    marginBottom: "16px",
    display: "flex",
    flexWrap: "wrap",
    color: "#ffffff",
  };

  if (loading) {
    return (
      <div style={{ ...shell, justifyContent: "center", padding: "20px" }}>
        <span style={{ fontSize: "13px", opacity: 0.7 }}>Caricamento progressi…</span>
      </div>
    );
  }

  const { currentWeight, startingWeight, deltaKg } = summary;
  const hasData = currentWeight != null;
  const deltaStr =
    deltaKg != null ? `${deltaKg > 0 ? "+" : ""}${deltaKg.toFixed(1)} kg` : "—";
  const deltaColor = deltaKg == null ? "#cbd5e1" : deltaKg > 0 ? "#fca5a5" : "#86efac";

  return (
    <div style={shell}>
      <div style={{ flex: "1 1 90px", minWidth: "80px", textAlign: "center", padding: "10px 8px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>{hasData ? `${currentWeight} kg` : "—"}</div>
        <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>Peso attuale</div>
      </div>
      <div style={{ flex: "1 1 90px", minWidth: "80px", textAlign: "center", padding: "10px 8px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>{startingWeight != null ? `${startingWeight} kg` : "—"}</div>
        <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>Peso iniziale</div>
      </div>
      <div style={{ flex: "1 1 90px", minWidth: "80px", textAlign: "center", padding: "10px 8px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700, color: deltaColor }}>{deltaStr}</div>
        <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>Variazione</div>
      </div>
      <div style={{ flex: "1 1 90px", minWidth: "80px", textAlign: "center", padding: "10px 8px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700 }}>{fmtDate(latestCheckInDate)}</div>
        <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>Ultimo check-in</div>
      </div>
    </div>
  );
}
