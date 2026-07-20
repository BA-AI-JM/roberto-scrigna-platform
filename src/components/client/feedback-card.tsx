"use client";

/**
 * #2 Stage-1 — "feedback first" card for the consolidated client dashboard.
 *
 * Renders the latest COMPLETED check-in (queried by the page via
 * checkin.list({ clientId, status: "completed", limit: 1 })): the auto summary
 * plus the key metrics + date. Presentational — the page owns the query and
 * passes the single record (or null). A cleaner checkin.getLatestCompleted query
 * is a Stage-2 backend follow-up; for now the existing list endpoint suffices.
 */

export interface FeedbackCheckin {
  id: string;
  ai_summary: string | null;
  /** Coach review notes (from checkin.getLatestCompleted). */
  review_notes?: string | null;
  weight_kg: number | null;
  weight_deviation_kg: number | null;
  energy_level: number | null;
  sleep_quality: number | null;
  adherence_pct: number | null;
  completed_at: string | null;
  created_at: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT");
}

function metric(label: string, value: string) {
  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a2e" }}>{value}</div>
    </div>
  );
}

export function FeedbackCard({ checkin }: { checkin: FeedbackCheckin | null }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid #f1f5f9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "12px",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
          Ultimo feedback
        </h3>
        {checkin && (
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            {fmtDate(checkin.completed_at ?? checkin.created_at)}
          </span>
        )}
      </div>

      {!checkin ? (
        <div
          style={{
            margin: "20px 24px",
            padding: "20px 24px",
            textAlign: "center",
            color: "#6b7280",
            background: "#f8fafc",
            borderRadius: "8px",
            border: "1px dashed #e2e8f0",
            fontSize: "13px",
          }}
        >
          Nessun check-in completato. Il feedback comparirà qui appena il cliente ne invia uno.
        </div>
      ) : (
        <>
          {checkin.ai_summary && (
            <div
              style={{
                padding: "16px 24px",
                fontSize: "14px",
                color: "#374151",
                lineHeight: 1.5,
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              {checkin.ai_summary}
            </div>
          )}
          {checkin.review_notes && (
            <div
              style={{
                padding: "12px 24px",
                fontSize: "13px",
                color: "#6b7280",
                lineHeight: 1.5,
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <span style={{ fontWeight: 600, color: "#374151" }}>Note del coach: </span>
              {checkin.review_notes}
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            }}
          >
            {metric(
              "Peso",
              checkin.weight_kg != null
                ? `${checkin.weight_kg} kg${
                    checkin.weight_deviation_kg != null && checkin.weight_deviation_kg !== 0
                      ? ` (${checkin.weight_deviation_kg > 0 ? "+" : ""}${checkin.weight_deviation_kg})`
                      : ""
                  }`
                : "—"
            )}
            {metric("Energia", checkin.energy_level != null ? `${checkin.energy_level}/10` : "—")}
            {metric("Sonno", checkin.sleep_quality != null ? `${checkin.sleep_quality}/10` : "—")}
            {metric(
              "Aderenza",
              checkin.adherence_pct != null ? `${checkin.adherence_pct}%` : "—"
            )}
          </div>
        </>
      )}
    </div>
  );
}
