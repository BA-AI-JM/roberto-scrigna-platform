/**
 * Client list page — /clients
 *
 * Shows all clients for the partner with:
 * - Search bar (debounced, uses trpc.client.list)
 * - Status filter tabs: Tutti / Attivi / In pausa / Archiviati
 * - Client cards with name, email, status badge, last snapshot date, plan count
 * - Click → /clients/[id]
 * - "+ Nuovo Cliente" → /plans/new
 * - Empty state when no results
 */

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

// ── Mobile detection hook ──────────────────────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "paused" | "archived";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

const STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  paused: "In pausa",
  archived: "Archiviato",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "#dcfce7", text: "#166534" },
  paused: { bg: "#fef3c7", text: "#92400e" },
  archived: { bg: "#f3f4f6", text: "#6b7280" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.archived!;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: c.bg,
        color: c.text,
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Filter tabs ────────────────────────────────────────────────────────────────

const FILTER_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tutti" },
  { value: "active", label: "Attivi" },
  { value: "paused", label: "In pausa" },
  { value: "archived", label: "Archiviati" },
];

// ── Page ───────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function ClientsPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input 300 ms; reset to page 0 on new search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset to page 0 when filter changes
  useEffect(() => {
    setPage(0);
  }, [statusFilter]);

  const { data, isLoading, isError } = trpc.client.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const clients = data?.clients ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div
      className="coach-container"
      style={{
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
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Roberto Scrigna</p>
          <h1 style={{ fontSize: "26px", fontWeight: 500, letterSpacing: "-0.01em", margin: 0, color: "#0f1729" }}>Clienti</h1>
          <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
            Gestisci i tuoi clienti e i loro piani nutrizionali
          </p>
        </div>
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
          + Nuovo Cliente
        </Link>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cerca per nome o email..."
          style={{
            width: "100%",
            padding: "11px 16px",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            fontSize: "14px",
            boxSizing: "border-box",
            outline: "none",
          }}
        />
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "24px",
        }}
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            style={{
              padding: "10px 16px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: statusFilter === tab.value ? 600 : 400,
              color: statusFilter === tab.value ? "#1a1a2e" : "#6b7280",
              borderBottom:
                statusFilter === tab.value
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

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: "80px 24px", color: "#6b7280" }}>
          <div style={{ fontSize: "14px" }}>Caricamento clienti...</div>
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div
          style={{
            padding: "20px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
            fontSize: "14px",
          }}
        >
          Errore nel caricamento dei clienti. Riprova tra poco.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && clients.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 24px", color: "#6b7280" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>👥</div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#374151" }}>
            Nessun cliente trovato
          </h3>
          <p style={{ fontSize: "14px", marginTop: "8px" }}>
            {debouncedSearch
              ? `Nessun risultato per "${debouncedSearch}"`
              : "Inizia aggiungendo il tuo primo cliente."}
          </p>
          {!debouncedSearch && (
            <Link
              href="/plans/new"
              style={{
                display: "inline-block",
                marginTop: "16px",
                padding: "10px 20px",
                backgroundColor: "#1a1a2e",
                color: "#ffffff",
                borderRadius: "8px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              + Aggiungi cliente
            </Link>
          )}
        </div>
      )}

      {/* Client list */}
      {!isLoading && !isError && clients.length > 0 && (
        <>
          {/* Mobile: card stack */}
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {clients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => router.push(`/clients/${client.id}`)}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "16px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e" }}>
                      {client.full_name}
                    </div>
                    <StatusBadge status={client.status} />
                  </div>
                  {client.email && (
                    <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}>
                      {client.email}
                    </div>
                  )}
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    Iscritto il <span className="tnum">{formatDate(client.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Desktop: table */
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <div className="table-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Cliente", "Email", "Stato", "Iscritto il", ""].map((h) => (
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
                  {clients.map((client, idx) => (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/clients/${client.id}`)}
                      style={{
                        borderBottom:
                          idx < clients.length - 1 ? "1px solid #f1f5f9" : "none",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                      }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>
                          {client.full_name}
                        </div>
                        {client.phone && (
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                            {client.phone}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "14px", color: "#6b7280" }}>
                        {client.email ?? <span style={{ color: "#6b7280" }}>—</span>}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <StatusBadge status={client.status} />
                      </td>
                      <td className="tnum" style={{ padding: "14px 16px", fontSize: "14px", color: "#6b7280" }}>
                        {formatDate(client.created_at)}
                      </td>
                      <td
                        style={{ padding: "14px 16px", textAlign: "right" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/clients/${client.id}`}
                          style={{
                            fontSize: "13px",
                            color: "#3b82f6",
                            fontWeight: 500,
                            padding: "6px 12px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "6px",
                            textDecoration: "none",
                          }}
                        >
                          Dettagli →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid #f1f5f9",
                  fontSize: "13px",
                  color: "#6b7280",
                }}
              >
                <span className="tnum">{total}</span> {total === 1 ? "cliente" : "clienti"} trovati
              </div>
            </div>
          )}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "16px",
                padding: "12px 0",
              }}
            >
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  padding: "8px 18px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: page === 0 ? "#d1d5db" : "#1a1a2e",
                  cursor: page === 0 ? "not-allowed" : "pointer",
                }}
              >
                Precedente
              </button>
              <span className="tnum" style={{ fontSize: "13px", color: "#6b7280" }}>
                Pagina {page + 1} di {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  padding: "8px 18px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: page >= totalPages - 1 ? "#d1d5db" : "#1a1a2e",
                  cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
                }}
              >
                Successivo
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
