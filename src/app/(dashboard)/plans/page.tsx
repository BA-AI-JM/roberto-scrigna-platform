/**
 * Plans listing page.
 *
 * Queries trpc.plan.list and renders all generated nutrition plans.
 * Each row links to /plans/[id]/review.
 */

"use client";

import { useState } from "react";
import { trpc } from "../../../lib/trpc/client";

/** Status filter values — aligned with the DB enum */
const STATUS_OPTIONS = [
  { key: "all", label: "Tutti" },
  { key: "draft", label: "Bozza" },
  { key: "active", label: "Attivo" },
  { key: "completed", label: "Completato" },
  { key: "archived", label: "Archiviato" },
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number]["key"];

/** Italian energy balance labels */
const ENERGY_LABELS: Record<string, string> = {
  deficit: "Deficit",
  surplus: "Surplus",
  maintenance: "Mantenimento",
};

export default function PlansPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isLoading, error } = trpc.plan.list.useQuery(
    statusFilter === "all" ? undefined : { status: statusFilter as "draft" | "active" | "completed" | "archived" }
  );

  const plans = data?.plans ?? [];

  return (
    <div className="coach-container">
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Roberto Scrigna</p>
          <h1 style={{ fontSize: "24px", fontWeight: 500, letterSpacing: "-0.01em", margin: 0, color: "#0f1729" }}>
            Piani Nutrizionali
          </h1>
          {data?.total !== undefined && (
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#6b7280" }}>
              {data.total} piano{data.total !== 1 ? "i" : ""} totali
            </p>
          )}
        </div>
        <a
          href="/plans/generate"
          style={{
            padding: "10px 20px",
            backgroundColor: "#18181b",
            color: "#ffffff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          + Genera Piano
        </a>
      </div>

      {/* Status filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "24px",
          borderBottom: "2px solid #e4e4e7",
          paddingBottom: "0",
        }}
      >
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderBottom:
                statusFilter === opt.key
                  ? "2px solid #18181b"
                  : "2px solid transparent",
              backgroundColor: "transparent",
              color: statusFilter === opt.key ? "#18181b" : "#71717a",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: statusFilter === opt.key ? 600 : 400,
              marginBottom: "-2px",
              whiteSpace: "nowrap",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            color: "#71717a",
          }}
        >
          <p style={{ fontSize: "14px" }}>Caricamento piani...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: "16px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "14px",
          }}
        >
          Errore nel caricamento dei piani: {error.message}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && plans.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            color: "#71717a",
          }}
        >
          <p style={{ fontSize: "16px", marginBottom: "8px", fontWeight: 500 }}>
            Nessun piano trovato.
          </p>
          <p style={{ fontSize: "14px", marginBottom: "20px" }}>
            Genera il primo piano nutrizionale per un cliente.
          </p>
          <a
            href="/plans/generate"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              backgroundColor: "#18181b",
              color: "#ffffff",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Genera Piano
          </a>
        </div>
      )}

      {/* Plans table */}
      {!isLoading && !error && plans.length > 0 && (
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafafa" }}>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#71717a",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid #e4e4e7",
                  }}
                >
                  Cliente
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#71717a",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid #e4e4e7",
                  }}
                >
                  Stato
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#71717a",
                    textAlign: "right",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid #e4e4e7",
                  }}
                >
                  Kcal Media
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#71717a",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid #e4e4e7",
                  }}
                >
                  Bilancio
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#71717a",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid #e4e4e7",
                  }}
                >
                  Data
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#71717a",
                    textAlign: "right",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid #e4e4e7",
                  }}
                >
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan, i) => (
                <tr
                  key={plan.id}
                  style={{
                    borderBottom:
                      i < plans.length - 1 ? "1px solid #f4f4f5" : "none",
                  }}
                >
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#18181b",
                    }}
                  >
                    {plan.clientName}
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#71717a",
                        marginTop: "2px",
                        fontWeight: 400,
                      }}
                    >
                      {plan.dayTypes
                        .map((dt) => {
                          const labels: Record<string, string> = {
                            training: "Allenamento",
                            rest: "Riposo",
                            refeed: "Refeed",
                            deload: "Deload",
                          };
                          return labels[dt] ?? dt;
                        })
                        .join(", ")}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <PlanStatusBadge status={plan.status} />
                  </td>
                  <td
                    className="tnum"
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      fontWeight: 600,
                      textAlign: "right",
                      color: "#18181b",
                    }}
                  >
                    {plan.weeklyAvgKcal > 0
                      ? `${plan.weeklyAvgKcal.toLocaleString("it-IT")} kcal`
                      : "—"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <EnergyBadge balance={plan.energyBalance} />
                  </td>
                  <td
                    className="tnum"
                    style={{
                      padding: "14px 16px",
                      fontSize: "13px",
                      color: "#71717a",
                    }}
                  >
                    {new Date(plan.createdAt).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <a
                      href={`/plans/${plan.id}/review`}
                      style={{
                        fontSize: "13px",
                        color: "#2563eb",
                        textDecoration: "none",
                        fontWeight: 600,
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #bfdbfe",
                        backgroundColor: "#eff6ff",
                        display: "inline-block",
                      }}
                    >
                      Revisione
                    </a>
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

/** Status badge with zinc/colour theming */
function PlanStatusBadge({ status }: { status: string }) {
  const themes: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: "#fef9c3", text: "#854d0e", label: "Bozza" },
    active: { bg: "#dcfce7", text: "#15803d", label: "Attivo" },
    completed: { bg: "#e0e7ff", text: "#3730a3", label: "Completato" },
    archived: { bg: "#f4f4f5", text: "#52525b", label: "Archiviato" },
  };

  const theme = themes[status] ?? { bg: "#f4f4f5", text: "#52525b", label: status };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      {theme.label}
    </span>
  );
}

/** Energy balance badge */
function EnergyBadge({ balance }: { balance: string }) {
  const themes: Record<string, { bg: string; text: string }> = {
    deficit: { bg: "#fef2f2", text: "#dc2626" },
    surplus: { bg: "#f0fdf4", text: "#16a34a" },
    maintenance: { bg: "#eff6ff", text: "#2563eb" },
  };

  const theme = themes[balance] ?? { bg: "#f4f4f5", text: "#52525b" };
  const label = ENERGY_LABELS[balance] ?? balance;

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: 500,
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      {label}
    </span>
  );
}
