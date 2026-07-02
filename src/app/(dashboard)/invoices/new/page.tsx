/**
 * New Invoice creation page.
 *
 * Multi-step form to create a draft invoice:
 * 1. Select client from dropdown (trpc.client.list)
 * 2. Add line items (description, quantity, unit price)
 * 3. Set dates, tax rate, notes
 * 4. Submit → trpc.invoice.create → redirect to invoice detail
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
}

interface InvoiceFormState {
  clientId: string;
  lineItems: LineItem[];
  taxPct: number;
  issuedDate: string;
  dueDate: string;
  description: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tempId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function lineSubtotal(item: LineItem): number {
  return item.quantity * item.unitPriceCents;
}

function calcTotal(items: LineItem[], taxPct: number): number {
  const subtotal = items.reduce((s, i) => s + lineSubtotal(i), 0);
  return Math.round(subtotal * (1 + taxPct / 100));
}

// ── Shared Styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  color: "#1a1a2e",
  background: "#ffffff",
  boxSizing: "border-box" as const,
  outline: "none",
} as const;

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 600,
          color: "#374151",
          marginBottom: "6px",
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Page Component ────────────────────────────────────────────────────────────

export default function NewInvoicePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0] ?? "";
  const thirtyDaysLater =
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0] ?? "";

  const [form, setForm] = useState<InvoiceFormState>({
    clientId: "",
    lineItems: [
      {
        id: tempId(),
        description: "",
        quantity: 1,
        unitPriceCents: 0,
      },
    ],
    taxPct: 22,
    issuedDate: today,
    dueDate: thirtyDaysLater,
    description: "",
  });

  // Load client list for dropdown
  const { data: clientsData, isLoading: clientsLoading } =
    trpc.client.list.useQuery({ status: "active", limit: 200 });

  const clients = clientsData?.clients ?? [];

  // tRPC mutation
  const createInvoice = trpc.invoice.create.useMutation({
    onSuccess: (result) => {
      router.push(`/invoices/${result.id}`);
    },
    onError: (err) => {
      setError(err.message);
      setSaving(false);
    },
  });

  function addLineItem() {
    setForm((f) => ({
      ...f,
      lineItems: [
        ...f.lineItems,
        { id: tempId(), description: "", quantity: 1, unitPriceCents: 0 },
      ],
    }));
  }

  function removeLineItem(id: string) {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.filter((li) => li.id !== id),
    }));
  }

  function updateLineItem(
    id: string,
    field: keyof Omit<LineItem, "id">,
    value: string | number
  ) {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((li) =>
        li.id === id ? { ...li, [field]: value } : li
      ),
    }));
  }

  const subtotalCents = form.lineItems.reduce(
    (s, li) => s + lineSubtotal(li),
    0
  );
  const totalCents = calcTotal(form.lineItems, form.taxPct);
  const taxCents = totalCents - subtotalCents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.clientId) {
      setError("Seleziona un cliente.");
      return;
    }

    if (form.lineItems.some((li) => !li.description.trim())) {
      setError("Ogni voce deve avere una descrizione.");
      return;
    }

    if (form.lineItems.some((li) => li.unitPriceCents <= 0)) {
      setError("Il prezzo unitario deve essere maggiore di zero.");
      return;
    }

    setSaving(true);
    createInvoice.mutate({
      clientId: form.clientId,
      lineItems: form.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
      })),
      taxPct: form.taxPct,
      currency: "EUR",
      issuedDate: form.issuedDate || undefined,
      dueDate: form.dueDate || undefined,
      description: form.description || undefined,
    });
  }

  return (
    <div className="coach-container" style={{ maxWidth: "860px" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <Link
          href="/invoices"
          style={{
            fontSize: "13px",
            color: "#6b7280",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            marginBottom: "16px",
          }}
        >
          ← Fatture
        </Link>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">
          Fatture
        </p>
        <h1 style={{ fontSize: "24px", fontWeight: 500, letterSpacing: "-0.01em", margin: 0, color: "#0f1729" }}>
          Nuova Fattura
        </h1>
        <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
          Compila i dettagli per creare una bozza di fattura.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Section: Cliente */}
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
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
            Cliente
          </h2>

          <Field label="Cliente *">
            {clientsLoading ? (
              <div
                style={{
                  height: "40px",
                  background: "#f1f5f9",
                  borderRadius: "8px",
                }}
              />
            ) : (
              <select
                value={form.clientId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientId: e.target.value }))
                }
                required
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  appearance: "auto",
                }}
              >
                <option value="">Seleziona un cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.email ? ` — ${c.email}` : ""}
                  </option>
                ))}
              </select>
            )}
            {clients.length === 0 && !clientsLoading && (
              <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                Nessun cliente attivo trovato.{" "}
                <Link
                  href="/plans/new"
                  style={{ color: "#1a1a2e", textDecoration: "underline" }}
                >
                  Aggiungi un cliente
                </Link>
              </p>
            )}
          </Field>

          <Field label="Descrizione / Note">
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Piano nutrizionale — pacchetto 3 mesi..."
              style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
            />
          </Field>
        </section>

        {/* Section: Voci */}
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
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

          {/* Line-item grid — scrolls horizontally on narrow screens so the
              1fr/80/140/36 columns keep alignment instead of crushing. */}
          <div className="overflow-x-auto">
          {/* Column headers */}
          <div
            className="grid min-w-[460px] grid-cols-[1fr_80px_140px_36px]"
            style={{
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            {["Descrizione", "Qtà", "Prezzo unitario", ""].map((h) => (
              <span
                key={h}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {/* Line items */}
          {form.lineItems.map((li) => (
            <div
              key={li.id}
              className="grid min-w-[460px] grid-cols-[1fr_80px_140px_36px]"
              style={{
                gap: "8px",
                marginBottom: "8px",
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={li.description}
                onChange={(e) =>
                  updateLineItem(li.id, "description", e.target.value)
                }
                placeholder="Piano nutrizionale personalizzato"
                style={inputStyle}
                required
              />
              <input
                type="number"
                value={li.quantity}
                min="0.01"
                step="0.01"
                onChange={(e) =>
                  updateLineItem(
                    li.id,
                    "quantity",
                    parseFloat(e.target.value) || 0
                  )
                }
                style={inputStyle}
              />
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#9ca3af",
                    fontSize: "14px",
                    pointerEvents: "none",
                  }}
                >
                  €
                </span>
                <input
                  type="number"
                  value={(li.unitPriceCents / 100).toFixed(2)}
                  min="0"
                  step="0.01"
                  onChange={(e) =>
                    updateLineItem(
                      li.id,
                      "unitPriceCents",
                      Math.round((parseFloat(e.target.value) || 0) * 100)
                    )
                  }
                  style={{ ...inputStyle, paddingLeft: "28px" }}
                />
              </div>
              <button
                type="button"
                onClick={() => removeLineItem(li.id)}
                disabled={form.lineItems.length === 1}
                style={{
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "transparent",
                  cursor:
                    form.lineItems.length === 1 ? "not-allowed" : "pointer",
                  color: "#9ca3af",
                  fontSize: "18px",
                  lineHeight: 1,
                  opacity: form.lineItems.length === 1 ? 0.4 : 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
          </div>

          <button
            type="button"
            onClick={addLineItem}
            style={{
              marginTop: "8px",
              padding: "8px 16px",
              border: "1px dashed #d1d5db",
              borderRadius: "8px",
              background: "transparent",
              cursor: "pointer",
              fontSize: "13px",
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            + Aggiungi voce
          </button>

          {/* Totals */}
          <div
            style={{
              marginTop: "24px",
              borderTop: "1px solid #e2e8f0",
              paddingTop: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 130px",
                  gap: "8px 16px",
                  textAlign: "right",
                }}
              >
                <span style={{ fontSize: "14px", color: "#6b7280" }}>
                  Subtotale
                </span>
                <span className="tnum" style={{ fontSize: "14px", fontWeight: 500 }}>
                  {formatCurrency(subtotalCents)}
                </span>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    justifyContent: "flex-end",
                  }}
                >
                  <label style={{ fontSize: "14px", color: "#6b7280" }}>
                    IVA
                  </label>
                  <input
                    type="number"
                    value={form.taxPct}
                    min="0"
                    max="100"
                    step="0.5"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        taxPct: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{
                      ...inputStyle,
                      width: "60px",
                      padding: "4px 8px",
                      textAlign: "right",
                    }}
                  />
                  <span style={{ fontSize: "14px", color: "#6b7280" }}>%</span>
                </div>
                <span className="tnum" style={{ fontSize: "14px", fontWeight: 500 }}>
                  {formatCurrency(taxCents)}
                </span>

                <span
                  style={{
                    fontSize: "16px",
                    fontWeight: 500,
                    paddingTop: "8px",
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  Totale
                </span>
                <span
                  className="tnum"
                  style={{
                    fontSize: "16px",
                    fontWeight: 500,
                    color: "#1a1a2e",
                    paddingTop: "8px",
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  {formatCurrency(totalCents)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Date */}
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "24px",
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
            Date
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "20px",
            }}
          >
            <Field label="Data emissione">
              <input
                type="date"
                value={form.issuedDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, issuedDate: e.target.value }))
                }
                style={inputStyle}
              />
            </Field>
            <Field label="Data scadenza">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dueDate: e.target.value }))
                }
                style={inputStyle}
              />
            </Field>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px 16px",
              background: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#b91c1c",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div
          style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}
        >
          <Link
            href="/invoices"
            style={{
              padding: "10px 20px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              textDecoration: "none",
              color: "#374151",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={saving || createInvoice.isPending}
            style={{
              padding: "10px 24px",
              backgroundColor:
                saving || createInvoice.isPending ? "#6b7280" : "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor:
                saving || createInvoice.isPending ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {saving || createInvoice.isPending ? "Creazione..." : "Salva Bozza"}
          </button>
        </div>
      </form>
    </div>
  );
}
