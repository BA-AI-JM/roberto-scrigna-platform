/**
 * Monitoring page — Check-in listing and batch review.
 *
 * Shows all check-ins for the partner with:
 * - Summary stats (pending, awaiting review, flagged)
 * - Status tab filter (all, pending, completed, reviewed)
 * - Check-in table with client name, weight, deviation flag, adherence, AI summary
 * - Batch review mode for completing all pending reviews
 * - Links to send new check-in, training log, notification settings
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckinStatus = "all" | "pending" | "completed" | "reviewed";

interface CheckinListItem {
  id: string;
  status: string;
  weightKg: number | null;
  weightDeviationKg: number | null;
  weightFlagged: boolean;
  energyLevel: number | null;
  sleepQuality: number | null;
  adherencePct: number | null;
  aiSummary: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  client: { id: string; fullName: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

// ── Status Badge ──────────────────────────────────────────────────────────────

const CHECKIN_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "In attesa", bg: "#fef3c7", text: "#92400e" },
  completed: { label: "Completato", bg: "#dbeafe", text: "#1d4ed8" },
  reviewed: { label: "Revisionato", bg: "#dcfce7", text: "#15803d" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = CHECKIN_STATUS_CONFIG[status] ?? { label: status, bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: cfg.bg,
        color: cfg.text,
      }}
    >
      {cfg.label}
    </span>
  );
}

function DeviationBadge({ kg, flagged }: { kg: number | null; flagged: boolean }) {
  if (kg === null) return <span style={{ color: "#6b7280" }}>—</span>;
  const dir = kg > 0 ? "+" : "";
  return (
    <span
      className="tnum"
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: flagged ? "#fee2e2" : "#f0fdf4",
        color: flagged ? "#b91c1c" : "#15803d",
      }}
    >
      {dir}{kg.toFixed(1)}kg
    </span>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const STATUS_TABS: Array<{ value: CheckinStatus; label: string }> = [
  { value: "all", label: "Tutti" },
  { value: "pending", label: "In attesa" },
  { value: "completed", label: "Da revisionare" },
  { value: "reviewed", label: "Revisionati" },
];

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
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
        flex: "1 1 180px",
      }}
    >
      <div style={{ fontSize: "13px", opacity: 0.7, marginBottom: "8px" }}>{label}</div>
      <div className="tnum" style={{ fontSize: "24px", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// ── Page Component ────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [activeStatus, setActiveStatus] = useState<CheckinStatus>("all");

  const { data, isLoading, isError } = trpc.checkin.list.useQuery({
    status: activeStatus === "all" ? undefined : activeStatus,
    limit: 200,
    offset: 0,
  });

  // The router returns snake_case columns — map to the camelCase shape the UI expects
  const checkins: CheckinListItem[] = (data?.checkins ?? []).map((c) => ({
    id: c.id,
    status: c.status,
    weightKg: (c as Record<string, unknown>).weight_kg as number | null ?? null,
    weightDeviationKg: (c as Record<string, unknown>).weight_deviation_kg as number | null ?? null,
    weightFlagged: Boolean((c as Record<string, unknown>).weight_flagged),
    energyLevel: (c as Record<string, unknown>).energy_level as number | null ?? null,
    sleepQuality: (c as Record<string, unknown>).sleep_quality as number | null ?? null,
    adherencePct: (c as Record<string, unknown>).adherence_pct as number | null ?? null,
    aiSummary: (c as Record<string, unknown>).ai_summary as string | null ?? null,
    dueDate: (c as Record<string, unknown>).due_date as string | null ?? null,
    completedAt: (c as Record<string, unknown>).completed_at as string | null ?? null,
    createdAt: c.created_at,
    client: (() => {
      const raw = Array.isArray(c.client) ? (c.client[0] ?? null) : c.client;
      if (!raw) return null;
      const r = raw as { id: string; full_name?: string; fullName?: string };
      return { id: r.id, fullName: r.fullName ?? r.full_name ?? "" };
    })(),
  }));

  // For summary cards we always need counts across all statuses — use the unfiltered total query
  const { data: allData } = trpc.checkin.list.useQuery({ limit: 200, offset: 0 });
  const allCheckins: CheckinListItem[] = (allData?.checkins ?? []).map((c) => ({
    id: c.id,
    status: c.status,
    weightKg: null,
    weightDeviationKg: null,
    weightFlagged: Boolean((c as Record<string, unknown>).weight_flagged),
    energyLevel: null,
    sleepQuality: null,
    adherencePct: null,
    aiSummary: null,
    dueDate: null,
    completedAt: null,
    createdAt: c.created_at,
    client: null,
  }));

  const pendingCount = allCheckins.filter((c) => c.status === "pending").length;
  const reviewCount = allCheckins.filter((c) => c.status === "completed").length;
  const flaggedCount = allCheckins.filter((c) => c.weightFlagged).length;
  const totalCount = allData?.total ?? 0;

  const filteredCheckins = checkins;

  return (
    <div className="coach-container">
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
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Roberto Scrigna</p>
          <h1 style={{ fontSize: "26px", fontWeight: 500, letterSpacing: "-0.01em", margin: 0, color: "#0f1729" }}>Monitoraggio</h1>
          <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
            Check-in clienti, log allenamento, notifiche
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <Link
            href="/monitoring/training"
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
            Log Allenamento
          </Link>
          <Link
            href="/monitoring/notifications"
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
            Notifiche
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "32px", flexWrap: "wrap" }}>
        <SummaryCard label="In attesa" value={String(pendingCount)} accent />
        <SummaryCard label="Da revisionare" value={String(reviewCount)} />
        <SummaryCard label="Segnalati" value={String(flaggedCount)} />
        <SummaryCard label="Totale check-in" value={String(totalCount)} />
      </div>

      {/* Status Tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "24px",
        }}
      >
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveStatus(tab.value)}
            style={{
              padding: "10px 16px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: activeStatus === tab.value ? 600 : 400,
              color: activeStatus === tab.value ? "#1a1a2e" : "#6b7280",
              borderBottom:
                activeStatus === tab.value
                  ? "2px solid #1a1a2e"
                  : "2px solid transparent",
              marginBottom: "-2px",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Check-in Table */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "80px 24px", color: "#6b7280" }}>
          <div style={{ fontSize: "16px" }}>Caricamento check-in...</div>
        </div>
      ) : isError ? (
        <div style={{ textAlign: "center", padding: "80px 24px", color: "#b91c1c" }}>
          <div style={{ fontSize: "16px", fontWeight: 600 }}>Errore nel caricamento dei dati.</div>
          <p style={{ fontSize: "14px", marginTop: "8px", color: "#6b7280" }}>
            Ricarica la pagina per riprovare.
          </p>
        </div>
      ) : filteredCheckins.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", color: "#6b7280" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#374151" }}>
            Nessun check-in in attesa
          </h3>
          <p style={{ fontSize: "14px", marginTop: "8px" }}>
            I check-in verranno visualizzati qui dopo l&apos;invio da parte dei clienti.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Cliente", "Stato", "Peso", "Deviazione", "Aderenza", "Riepilogo AI", "Data", ""].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredCheckins.map((ci, idx) => (
                <tr
                  key={ci.id}
                  style={{
                    borderBottom:
                      idx < filteredCheckins.length - 1
                        ? "1px solid #f1f5f9"
                        : "none",
                    backgroundColor: ci.weightFlagged ? "#fffbeb" : "transparent",
                  }}
                >
                  <td style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>
                    {ci.client?.fullName ?? "—"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={ci.status} />
                  </td>
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {ci.weightKg ? `${ci.weightKg} kg` : "—"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <DeviationBadge kg={ci.weightDeviationKg} flagged={ci.weightFlagged} />
                  </td>
                  <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {ci.adherencePct !== null ? `${ci.adherencePct}%` : "—"}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "13px",
                      color: "#6b7280",
                      maxWidth: "300px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ci.aiSummary ?? "—"}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: "14px", color: "#6b7280" }}>
                    {formatDate(ci.completedAt ?? ci.createdAt)}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "#1a1a2e",
                        fontWeight: 500,
                        padding: "6px 12px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Dettagli →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
