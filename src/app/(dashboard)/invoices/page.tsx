/**
 * Invoices listing page.
 *
 * Shows all invoices for the authenticated partner with:
 * - Summary stats (outstanding, paid this month, overdue count)
 * - Status tab filter (all, draft, sent, paid, overdue, cancelled)
 * - Invoice table with client name, amount, due date, status badge
 * - Link to create new invoice
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Invoice status values */
type InvoiceStatus = "all" | "draft" | "sent" | "paid" | "overdue" | "cancelled";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format cents as a currency string (it-IT locale → €1.234,56).
 */
function formatCurrency(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Format ISO date string as localised date.
 */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

// ── Status Badge ──────────────────────────────────────────────────────────────

/** Status display config */
const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  draft: { label: "Bozza", bg: "#f1f5f9", text: "#475569" },
  sent: { label: "Inviata", bg: "#dbeafe", text: "#1d4ed8" },
  paid: { label: "Pagata", bg: "#dcfce7", text: "#15803d" },
  overdue: { label: "Scaduta", bg: "#fee2e2", text: "#b91c1c" },
  cancelled: { label: "Annullata", bg: "#f3f4f6", text: "#6b7280" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    bg: "#f3f4f6",
    text: "#374151",
  };
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

// ── Status Tabs ───────────────────────────────────────────────────────────────

const STATUS_TABS: Array<{ value: InvoiceStatus; label: string }> = [
  { value: "all", label: "Tutte" },
  { value: "draft", label: "Bozze" },
  { value: "sent", label: "Inviate" },
  { value: "paid", label: "Pagate" },
  { value: "overdue", label: "Scadute" },
  { value: "cancelled", label: "Annullate" },
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
        flex: "1 1 200px",
      }}
    >
      <div style={{ fontSize: "13px", opacity: 0.7, marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "24px", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ── Skeleton Loader ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: "16px",
            borderBottom: i < 4 ? "1px solid #f1f5f9" : "none",
            display: "flex",
            gap: "16px",
          }}
        >
          {[120, 160, 100, 100, 90, 60].map((w, j) => (
            <div
              key={j}
              style={{
                height: "16px",
                width: `${w}px`,
                background: "#f1f5f9",
                borderRadius: "4px",
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Page Component ────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const [activeStatus, setActiveStatus] = useState<InvoiceStatus>("all");

  // Fetch invoices — pass status filter (undefined = all)
  const { data: invoices, isLoading: invoicesLoading, error: invoicesError } =
    trpc.invoice.list.useQuery({
      status: activeStatus === "all" ? undefined : activeStatus,
      limit: 100,
      offset: 0,
    });

  // Fetch summary stats
  const { data: summary } = trpc.invoice.getSummary.useQuery();

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1200px",
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
          <h1 style={{ fontSize: "26px", fontWeight: 700, margin: 0 }}>
            Fatture
          </h1>
          <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
            Gestisci le fatture dei tuoi clienti
          </p>
        </div>
        <Link
          href="/invoices/new"
          style={{
            padding: "10px 20px",
            backgroundColor: "#1a1a2e",
            color: "#ffffff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          + Nuova Fattura
        </Link>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "32px",
          flexWrap: "wrap",
        }}
      >
        <SummaryCard
          label="Da incassare"
          value={formatCurrency(summary?.outstandingCents ?? 0)}
          accent
        />
        <SummaryCard
          label="Incassato questo mese"
          value={formatCurrency(summary?.paidThisMonthCents ?? 0)}
        />
        <SummaryCard
          label="Fatture scadute"
          value={String(summary?.overdueCount ?? 0)}
        />
        <SummaryCard
          label="Totale fatture"
          value={String(summary?.totalInvoices ?? 0)}
        />
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

      {/* Error */}
      {invoicesError && (
        <div
          style={{
            padding: "12px 16px",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#b91c1c",
            fontSize: "14px",
            marginBottom: "20px",
          }}
        >
          Errore nel caricamento delle fatture: {invoicesError.message}
        </div>
      )}

      {/* Loading skeleton */}
      {invoicesLoading && <TableSkeleton />}

      {/* Invoice Table */}
      {!invoicesLoading && !invoicesError && (
        <>
          {(invoices ?? []).length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "80px 24px",
                color: "#9ca3af",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📄</div>
              <h3
                style={{ fontSize: "16px", fontWeight: 600, color: "#374151" }}
              >
                Nessuna fattura
              </h3>
              <p style={{ fontSize: "14px", marginTop: "8px" }}>
                {activeStatus === "all"
                  ? "Crea la tua prima fattura con il pulsante in alto a destra."
                  : `Nessuna fattura con stato "${STATUS_CONFIG[activeStatus]?.label ?? activeStatus}".`}
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
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Numero",
                      "Cliente",
                      "Data emissione",
                      "Scadenza",
                      "Importo",
                      "Stato",
                      "",
                    ].map((h) => (
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
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(invoices ?? []).map((inv, idx) => {
                    // Supabase returns snake_case — the tRPC router returns raw DB rows
                    const row = inv as unknown as {
                      id: string;
                      invoice_number: string;
                      status: string;
                      amount_cents: number;
                      currency: string;
                      issued_date: string | null;
                      due_date: string | null;
                      client: { id: string; full_name: string; email: string | null } | null;
                    };
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom:
                            idx < (invoices ?? []).length - 1
                              ? "1px solid #f1f5f9"
                              : "none",
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          (window.location.href = `/invoices/${row.id}`)
                        }
                      >
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#1a1a2e",
                          }}
                        >
                          {row.invoice_number}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "14px",
                            color: "#374151",
                          }}
                        >
                          {row.client?.full_name ?? "—"}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "14px",
                            color: "#6b7280",
                          }}
                        >
                          {formatDate(row.issued_date)}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "14px",
                            color:
                              row.status === "overdue" ? "#b91c1c" : "#6b7280",
                          }}
                        >
                          {formatDate(row.due_date)}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#1a1a2e",
                          }}
                        >
                          {formatCurrency(row.amount_cents, row.currency)}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <StatusBadge status={row.status} />
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            textAlign: "right",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/invoices/${row.id}`}
                            style={{
                              fontSize: "13px",
                              color: "#1a1a2e",
                              textDecoration: "none",
                              fontWeight: 500,
                              padding: "6px 12px",
                              border: "1px solid #e2e8f0",
                              borderRadius: "6px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Apri →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
