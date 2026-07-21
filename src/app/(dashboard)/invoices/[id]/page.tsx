/**
 * Invoice detail page.
 *
 * Shows full invoice details with:
 * - Invoice header (number, status badge, client info)
 * - Line items table
 * - Totals (subtotal, IVA, totale)
 * - Status action buttons (Segna come Inviata / Pagata / Scaduta, Annulla)
 * - "Scarica PDF" button — calls /api/invoice/[id]/pdf
 * - Delete/cancel action
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { humanizeTrpcError } from "@/lib/human-error";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxPct?: number;
}

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
type PaymentMethod = "contanti" | "bonifico" | "sumup";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  contanti: "Contanti",
  bonifico: "Bonifico",
  sumup: "SumUp",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Bozza",
  sent: "Inviata",
  paid: "Pagata",
  overdue: "Scaduta",
  cancelled: "Annullata",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#f1f5f9", text: "#475569" },
  sent: { bg: "#dbeafe", text: "#1d4ed8" },
  paid: { bg: "#dcfce7", text: "#15803d" },
  overdue: { bg: "#fee2e2", text: "#b91c1c" },
  cancelled: { bg: "#f3f4f6", text: "#6b7280" },
};

const NEXT_STATUS_MAP: Record<string, Array<{ status: InvoiceStatus; label: string }>> = {
  draft: [
    { status: "sent", label: "Segna come Inviata" },
    { status: "cancelled", label: "Annulla Fattura" },
  ],
  sent: [
    { status: "paid", label: "Segna come Pagata" },
    { status: "overdue", label: "Segna come Scaduta" },
    { status: "cancelled", label: "Annulla Fattura" },
  ],
  overdue: [
    { status: "paid", label: "Segna come Pagata" },
    { status: "cancelled", label: "Annulla Fattura" },
  ],
  paid: [],
  cancelled: [],
};

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
      <span
        style={{
          width: "140px",
          flexShrink: 0,
          fontSize: "13px",
          color: "#6b7280",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "14px", color: "#1a1a2e", fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

function InvoiceLoading() {
  return (
    <div className="coach-container" style={{ maxWidth: "860px" }}>
      <div
        style={{
          height: "16px",
          width: "80px",
          background: "#f1f5f9",
          borderRadius: "4px",
          marginBottom: "32px",
        }}
      />
      <div
        style={{
          height: "280px",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          marginBottom: "20px",
        }}
      />
      <div
        style={{
          height: "200px",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
        }}
      />
    </div>
  );
}

// ── Page Component ────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [statusError, setStatusError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  // "Segna come pagata" opens an inline method picker before committing markPaid.
  const [payingOpen, setPayingOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<"" | PaymentMethod>("");

  // Fetch invoice data
  const {
    data: invoiceRaw,
    isLoading,
    error: fetchError,
    refetch,
  } = trpc.invoice.getById.useQuery({ id: invoiceId });

  // Status update mutation
  const updateStatus = trpc.invoice.updateStatus.useMutation({
    onSuccess: () => {
      void refetch();
      setStatusError(null);
    },
    onError: (err) => {
      setStatusError(humanizeTrpcError(err.message));
    },
  });

  // Mark-paid mutation (records the payment method chosen in the inline picker).
  const markPaid = trpc.invoice.markPaid.useMutation({
    onSuccess: () => {
      void refetch();
      setStatusError(null);
      setPayingOpen(false);
      setPayMethod("");
    },
    onError: (err) => {
      setStatusError(humanizeTrpcError(err.message));
    },
  });

  // Delete mutation
  const deleteInvoice = trpc.invoice.delete.useMutation({
    onSuccess: () => {
      router.push("/invoices");
    },
    onError: (err) => {
      setStatusError(humanizeTrpcError(err.message));
    },
  });

  async function handleStatusUpdate(newStatus: InvoiceStatus) {
    setStatusError(null);
    updateStatus.mutate({
      id: invoiceId,
      status: newStatus,
      paidDate:
        newStatus === "paid"
          ? new Date().toISOString().split("T")[0]
          : undefined,
    });
  }

  function handleConfirmPaid() {
    setStatusError(null);
    markPaid.mutate({
      id: invoiceId,
      paymentMethod: payMethod || undefined,
    });
  }

  function handleDelete() {
    if (!confirm("Sei sicuro di voler annullare questa fattura?")) return;
    deleteInvoice.mutate({ id: invoiceId });
  }

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/invoice/${invoiceId}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Errore nel download del PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fattura-${invoice?.invoice_number ?? invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Errore nel download del PDF."
      );
    } finally {
      setPdfLoading(false);
    }
  }

  if (isLoading) return <InvoiceLoading />;

  if (fetchError || !invoiceRaw) {
    return (
      <div className="coach-container" style={{ maxWidth: "860px" }}>
        <Link
          href="/invoices"
          style={{
            fontSize: "13px",
            color: "#6b7280",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            marginBottom: "24px",
          }}
        >
          ← Fatture
        </Link>
        <div
          style={{
            textAlign: "center",
            padding: "80px 24px",
            background: "#f8fafc",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📄</div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: "#374151",
              margin: 0,
            }}
          >
            Fattura non trovata
          </h2>
          <p style={{ color: "#6b7280", marginTop: "8px", fontSize: "14px" }}>
            {fetchError?.message ?? "La fattura richiesta non esiste o non hai i permessi per visualizzarla."}
          </p>
        </div>
      </div>
    );
  }

  // Cast the raw DB-shaped response to typed variables
  const invoice = invoiceRaw as unknown as {
    id: string;
    invoice_number: string;
    status: InvoiceStatus;
    amount_cents: number;
    currency: string;
    tax_pct: number;
    issued_date: string | null;
    due_date: string | null;
    paid_date: string | null;
    payment_method: PaymentMethod | null;
    description: string | null;
    line_items: LineItem[];
    created_at: string;
    client: {
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
    } | null;
  };

  const lineItems: LineItem[] = Array.isArray(invoice.line_items)
    ? invoice.line_items
    : [];

  const subtotalCents = lineItems.reduce(
    (s, li) => s + li.quantity * li.unitPriceCents,
    0
  );
  const taxCents = invoice.amount_cents - subtotalCents;

  const statusCfg = STATUS_COLORS[invoice.status] ?? {
    bg: "#f3f4f6",
    text: "#374151",
  };
  const nextActions = NEXT_STATUS_MAP[invoice.status] ?? [];
  const isBusy =
    updateStatus.isPending || deleteInvoice.isPending || markPaid.isPending;

  return (
    <div className="coach-container" style={{ maxWidth: "860px" }}>
      {/* Breadcrumb */}
      <Link
        href="/invoices"
        style={{
          fontSize: "13px",
          color: "#6b7280",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          marginBottom: "24px",
        }}
      >
        ← Fatture
      </Link>

      {/* Invoice header card */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "28px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "24px",
          }}
        >
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Fattura</p>
            <h1
              className="tnum"
              style={{
                fontSize: "22px",
                fontWeight: 500,
                margin: 0,
                color: "#0f1729",
              }}
            >
              {invoice.invoice_number}
            </h1>
            {invoice.description && (
              <p
                style={{
                  color: "#6b7280",
                  marginTop: "6px",
                  fontSize: "14px",
                  margin: "6px 0 0",
                }}
              >
                {invoice.description}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                display: "inline-block",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: statusCfg.bg,
                color: statusCfg.text,
              }}
            >
              {STATUS_LABELS[invoice.status] ?? invoice.status}
            </span>
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              style={{
                padding: "8px 16px",
                backgroundColor: "#ffffff",
                color: "#1a1a2e",
                border: "1px solid #1a1a2e",
                borderRadius: "8px",
                cursor: pdfLoading ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                opacity: pdfLoading ? 0.6 : 1,
              }}
            >
              {pdfLoading ? "Download..." : "Scarica PDF"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0 48px",
          }}
        >
          <div>
            <InfoRow label="Cliente" value={invoice.client?.full_name ?? "—"} />
            <InfoRow label="Email" value={invoice.client?.email ?? "—"} />
            <InfoRow label="Telefono" value={invoice.client?.phone ?? "—"} />
          </div>
          <div>
            <InfoRow
              label="Data emissione"
              value={formatDate(invoice.issued_date)}
            />
            <InfoRow
              label="Data scadenza"
              value={formatDate(invoice.due_date)}
            />
            {invoice.status === "paid" && (
              <InfoRow
                label="Data pagamento"
                value={formatDate(invoice.paid_date)}
              />
            )}
            {invoice.status === "paid" && invoice.payment_method && (
              <InfoRow
                label="Metodo pagamento"
                value={
                  PAYMENT_METHOD_LABELS[invoice.payment_method] ??
                  invoice.payment_method
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "28px",
          marginBottom: "20px",
        }}
      >
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 500,
            marginTop: 0,
            marginBottom: "20px",
          }}
        >
          Voci
        </h2>

        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Descrizione", "Qtà", "Prezzo unitario", "Totale"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Descrizione" ? "left" : "right",
                    padding: "8px 0",
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
            {lineItems.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: "24px 0",
                    textAlign: "center",
                    color: "#6b7280",
                    fontSize: "14px",
                  }}
                >
                  Nessuna voce presente.
                </td>
              </tr>
            ) : (
              lineItems.map((li, idx) => (
                <tr key={idx}>
                  <td
                    style={{
                      padding: "12px 0",
                      fontSize: "14px",
                      color: "#374151",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {li.description}
                  </td>
                  <td
                    className="tnum"
                    style={{
                      padding: "12px 0",
                      fontSize: "14px",
                      color: "#6b7280",
                      textAlign: "right",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {li.quantity}
                  </td>
                  <td
                    className="tnum"
                    style={{
                      padding: "12px 0",
                      fontSize: "14px",
                      color: "#6b7280",
                      textAlign: "right",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {formatCurrency(li.unitPriceCents, invoice.currency)}
                  </td>
                  <td
                    className="tnum"
                    style={{
                      padding: "12px 0",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#1a1a2e",
                      textAlign: "right",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {formatCurrency(
                      li.quantity * li.unitPriceCents,
                      invoice.currency
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        {/* Totals */}
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", gap: "32px" }}>
            <span style={{ fontSize: "14px", color: "#6b7280" }}>
              Subtotale
            </span>
            <span
              className="tnum"
              style={{
                fontSize: "14px",
                fontWeight: 600,
                minWidth: "120px",
                textAlign: "right",
              }}
            >
              {formatCurrency(subtotalCents, invoice.currency)}
            </span>
          </div>
          <div style={{ display: "flex", gap: "32px" }}>
            <span style={{ fontSize: "14px", color: "#6b7280" }}>
              IVA ({invoice.tax_pct}%)
            </span>
            <span
              className="tnum"
              style={{
                fontSize: "14px",
                fontWeight: 600,
                minWidth: "120px",
                textAlign: "right",
              }}
            >
              {formatCurrency(taxCents, invoice.currency)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: "32px",
              paddingTop: "8px",
              borderTop: "2px solid #1a1a2e",
            }}
          >
            <span style={{ fontSize: "16px", fontWeight: 600 }}>Totale</span>
            <span
              className="tnum"
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#1a1a2e",
                minWidth: "120px",
                textAlign: "right",
              }}
            >
              {formatCurrency(invoice.amount_cents, invoice.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {(nextActions.length > 0 || invoice.status !== "cancelled") && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{ fontSize: "14px", color: "#6b7280", flexShrink: 0 }}
          >
            Azioni:
          </span>

          {nextActions.map((action) => (
            <button
              key={action.status}
              onClick={() =>
                action.status === "paid"
                  ? setPayingOpen((v) => !v)
                  : handleStatusUpdate(action.status)
              }
              disabled={isBusy}
              style={{
                padding: "8px 16px",
                border:
                  action.status === "cancelled"
                    ? "1px solid #fecaca"
                    : "1px solid #1a1a2e",
                borderRadius: "8px",
                background:
                  action.status === "paid"
                    ? "#1a1a2e"
                    : action.status === "cancelled"
                    ? "#fff1f2"
                    : "#ffffff",
                color:
                  action.status === "paid"
                    ? "#ffffff"
                    : action.status === "cancelled"
                    ? "#b91c1c"
                    : "#1a1a2e",
                cursor: isBusy ? "not-allowed" : "pointer",
                fontSize: "13px",
                fontWeight: 600,
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              {action.label}
            </button>
          ))}

          {payingOpen && (
            <div
              style={{
                width: "100%",
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: "4px",
                paddingTop: "12px",
                borderTop: "1px dashed #e2e8f0",
              }}
            >
              <label style={{ fontSize: "13px", color: "#6b7280" }}>
                Metodo di pagamento:
              </label>
              <select
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(e.target.value as "" | PaymentMethod)
                }
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#1a1a2e",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <option value="">—</option>
                <option value="contanti">Contanti</option>
                <option value="bonifico">Bonifico</option>
                <option value="sumup">SumUp</option>
              </select>
              <button
                onClick={handleConfirmPaid}
                disabled={isBusy}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #1a1a2e",
                  borderRadius: "8px",
                  background: "#1a1a2e",
                  color: "#ffffff",
                  cursor: isBusy ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  opacity: isBusy ? 0.6 : 1,
                }}
              >
                {markPaid.isPending ? "Conferma..." : "Conferma pagamento"}
              </button>
            </div>
          )}

          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <button
              onClick={handleDelete}
              disabled={isBusy}
              style={{
                marginLeft: "auto",
                padding: "8px 16px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                background: "transparent",
                color: "#6b7280",
                cursor: isBusy ? "not-allowed" : "pointer",
                fontSize: "13px",
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              Elimina
            </button>
          )}

          {statusError && (
            <span
              style={{
                fontSize: "13px",
                color: "#b91c1c",
                width: "100%",
                marginTop: "4px",
              }}
            >
              {statusError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
