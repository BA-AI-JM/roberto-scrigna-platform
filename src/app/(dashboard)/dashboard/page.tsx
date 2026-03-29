/**
 * Roberto Dashboard — main operational overview.
 *
 * Displays:
 * - 5 KPI cards (active clients, pending check-ins, flagged weight, revenue, overdue tasks)
 * - Smart alerts section (items requiring attention)
 * - Revenue timeline (12-month bar chart placeholder)
 * - Pipeline breakdown (client status distribution)
 * - Engagement heatmap (12-week client × activity grid)
 * - Quick action links
 */

"use client";

import { useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SmartAlert {
  id: string;
  type: "warning" | "danger" | "info" | "success";
  category: string;
  title: string;
  description: string;
  actionUrl: string | null;
  clientName: string | null;
}

interface HeatmapRow {
  clientId: string;
  clientName: string;
  weeks: number[];
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  trend,
  accent,
}: {
  label: string;
  value: string;
  trend?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "20px 24px",
        background: accent ? "#1a1a2e" : "#ffffff",
        color: accent ? "#ffffff" : "#1a1a2e",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        flex: "1 1 200px",
        minWidth: "180px",
      }}
    >
      <div style={{ fontSize: "13px", opacity: 0.7, marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: 700 }}>{value}</div>
      {trend && (
        <div
          style={{
            fontSize: "12px",
            marginTop: "6px",
            color: accent ? "rgba(255,255,255,0.7)" : "#6b7280",
          }}
        >
          {trend}
        </div>
      )}
    </div>
  );
}

// ── Alert Card ────────────────────────────────────────────────────────────────

const ALERT_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  danger: { border: "#ef4444", bg: "#fef2f2", icon: "🚨" },
  warning: { border: "#f59e0b", bg: "#fffbeb", icon: "⚠️" },
  info: { border: "#3b82f6", bg: "#eff6ff", icon: "ℹ️" },
  success: { border: "#22c55e", bg: "#f0fdf4", icon: "✅" },
};

function AlertCard({ alert }: { alert: SmartAlert }) {
  const colors = ALERT_COLORS[alert.type] ?? ALERT_COLORS.info!;
  const content = (
    <div
      style={{
        padding: "14px 18px",
        background: colors.bg,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: "8px",
        cursor: alert.actionUrl ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <span style={{ fontSize: "16px" }}>{colors.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "2px" }}>
            <span style={{ color: "#9ca3af", fontWeight: 400, marginRight: "8px" }}>
              {alert.category}
            </span>
            {alert.title}
          </div>
          <div style={{ fontSize: "13px", color: "#6b7280" }}>{alert.description}</div>
        </div>
      </div>
    </div>
  );

  if (alert.actionUrl) {
    return (
      <Link href={alert.actionUrl} style={{ textDecoration: "none" }}>
        {content}
      </Link>
    );
  }
  return content;
}

// ── Engagement Heatmap ────────────────────────────────────────────────────────

function EngagementHeatmap({ data }: { data: HeatmapRow[] }) {
  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
        <p style={{ fontSize: "14px" }}>Nessun dato di engagement disponibile</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.flatMap((r) => r.weeks), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th
              style={{
                padding: "8px 12px",
                textAlign: "left",
                fontSize: "11px",
                fontWeight: 600,
                color: "#9ca3af",
                minWidth: "140px",
              }}
            >
              Cliente
            </th>
            {Array.from({ length: 12 }, (_, i) => (
              <th
                key={i}
                style={{
                  padding: "8px 4px",
                  textAlign: "center",
                  fontSize: "10px",
                  color: "#9ca3af",
                  fontWeight: 400,
                }}
              >
                S{12 - i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.clientId}>
              <td
                style={{
                  padding: "4px 12px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#374151",
                  whiteSpace: "nowrap",
                }}
              >
                {row.clientName}
              </td>
              {row.weeks.map((count, i) => {
                const intensity = count / maxValue;
                const bg =
                  count === 0
                    ? "#f3f4f6"
                    : intensity < 0.33
                      ? "#dcfce7"
                      : intensity < 0.66
                        ? "#86efac"
                        : "#22c55e";
                return (
                  <td key={i} style={{ padding: "4px" }}>
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "4px",
                        backgroundColor: bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        color: count > 0 ? "#065f46" : "#d1d5db",
                        fontWeight: 600,
                        margin: "0 auto",
                      }}
                      title={`${row.clientName}: ${count} attività nella settimana ${12 - i}`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Revenue Chart Placeholder ─────────────────────────────────────────────────

function RevenueChart({
  data,
}: {
  data: Array<{ month: string; revenueCents: number }>;
}) {
  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
        <p style={{ fontSize: "14px" }}>Nessun dato di fatturato disponibile</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenueCents), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "180px", padding: "0 8px" }}>
      {data.map((d) => {
        const height = Math.max((d.revenueCents / maxRevenue) * 160, 4);
        const monthLabel = d.month.split("-")[1]!;
        return (
          <div
            key={d.month}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "40px",
                height: `${height}px`,
                backgroundColor: d.revenueCents > 0 ? "#1a1a2e" : "#e5e7eb",
                borderRadius: "4px 4px 0 0",
                transition: "height 0.3s",
              }}
              title={`€${(d.revenueCents / 100).toFixed(0)}`}
            />
            <div
              style={{
                fontSize: "10px",
                color: "#9ca3af",
                marginTop: "6px",
                fontWeight: 500,
              }}
            >
              {monthLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Pipeline Chart ────────────────────────────────────────────────────────────

function PipelineChart({ data }: { data: Array<{ status: string; count: number }> }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const labels: Record<string, string> = {
    active: "Attivi",
    paused: "In pausa",
    archived: "Archiviati",
  };
  const colors: Record<string, string> = {
    active: "#22c55e",
    paused: "#f59e0b",
    archived: "#9ca3af",
  };

  if (total === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
        <p style={{ fontSize: "14px" }}>Nessun cliente</p>
      </div>
    );
  }

  return (
    <div>
      {/* Bar */}
      <div
        style={{
          display: "flex",
          borderRadius: "8px",
          overflow: "hidden",
          height: "32px",
          marginBottom: "16px",
        }}
      >
        {data
          .filter((d) => d.count > 0)
          .map((d) => (
            <div
              key={d.status}
              style={{
                flex: d.count,
                backgroundColor: colors[d.status] ?? "#e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 600,
                color: "#ffffff",
                minWidth: "30px",
              }}
            >
              {d.count}
            </div>
          ))}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: "20px", justifyContent: "center" }}>
        {data.map((d) => (
          <div key={d.status} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: colors[d.status] ?? "#e5e7eb",
              }}
            />
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              {labels[d.status] ?? d.status}: {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page Component ────────────────────────────────────────────────────────────

/** Mock data for the initial shell — replaced with tRPC data when wired */
const MOCK_ALERTS: SmartAlert[] = [];
const MOCK_HEATMAP: HeatmapRow[] = [];
const MOCK_REVENUE: Array<{ month: string; revenueCents: number }> = [];
const MOCK_PIPELINE: Array<{ status: string; count: number }> = [
  { status: "active", count: 0 },
  { status: "paused", count: 0 },
  { status: "archived", count: 0 },
];

export default function DashboardPage() {
  const [_refreshKey] = useState(0);

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1400px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "28px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
            Panoramica operativa — Roberto Scrigna
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <Link
            href="/monitoring"
            style={{
              padding: "10px 20px",
              backgroundColor: "#ffffff",
              color: "#1a1a2e",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Monitoraggio
          </Link>
          <Link
            href="/invoices"
            style={{
              padding: "10px 20px",
              backgroundColor: "#ffffff",
              color: "#1a1a2e",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Fatture
          </Link>
          <Link
            href="/plans/new"
            style={{
              padding: "10px 20px",
              backgroundColor: "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            + Nuovo Piano
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "32px", flexWrap: "wrap" }}>
        <KpiCard label="Clienti attivi" value="0" trend="su 0 totali" accent />
        <KpiCard label="Check-in in attesa" value="0" />
        <KpiCard label="Segnalazioni peso" value="0" />
        <KpiCard
          label="Fatturato mese"
          value="€ 0"
          trend="€ 0 in sospeso"
        />
        <KpiCard label="Task scaduti" value="0" />
      </div>

      {/* Smart Alerts */}
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a2e", marginBottom: "16px" }}>
          Avvisi
        </h2>
        {MOCK_ALERTS.length === 0 ? (
          <div
            style={{
              padding: "32px",
              background: "#f0fdf4",
              borderRadius: "12px",
              textAlign: "center",
              border: "1px solid #dcfce7",
            }}
          >
            <span style={{ fontSize: "24px" }}>✅</span>
            <p style={{ fontSize: "14px", color: "#15803d", marginTop: "8px", fontWeight: 500 }}>
              Nessun avviso — tutto in ordine!
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {MOCK_ALERTS.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </div>

      {/* Two-column layout: Revenue + Pipeline */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px", marginBottom: "32px" }}>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", marginBottom: "20px" }}>
            Fatturato (ultimi 12 mesi)
          </h3>
          <RevenueChart data={MOCK_REVENUE} />
        </div>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", marginBottom: "20px" }}>
            Pipeline Clienti
          </h3>
          <PipelineChart data={MOCK_PIPELINE} />
        </div>
      </div>

      {/* Engagement Heatmap */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", marginBottom: "20px" }}>
          Engagement Heatmap (12 settimane)
        </h3>
        <EngagementHeatmap data={MOCK_HEATMAP} />
      </div>
    </div>
  );
}
