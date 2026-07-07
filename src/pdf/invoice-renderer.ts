/**
 * Invoice HTML renderer.
 *
 * Produces a branded A4 HTML document for Roberto Scrigna invoices.
 * Designed to render correctly in Puppeteer for PDF output.
 *
 * Layout:
 * - Header: Roberto Scrigna branding + invoice number
 * - Issuer / Client block (two columns)
 * - Line items table
 * - Totals (Subtotale, IVA, Totale)
 * - Footer: payment notes, contacts
 */

interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxPct?: number;
}

export interface InvoiceRenderData {
  invoiceNumber: string;
  status: string;
  amountCents: number;
  currency: string;
  taxPct: number;
  issuedDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  description: string | null;
  lineItems: LineItem[];
  client: {
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  partnerName: string;
  partnerEmail: string;
}

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
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Bozza",
  sent: "Inviata",
  paid: "Pagata",
  overdue: "Scaduta",
  cancelled: "Annullata",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: "#f1f5f9", color: "#475569" },
  sent: { bg: "#dbeafe", color: "#1d4ed8" },
  paid: { bg: "#dcfce7", color: "#15803d" },
  overdue: { bg: "#fee2e2", color: "#b91c1c" },
  cancelled: { bg: "#f3f4f6", color: "#6b7280" },
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export function renderInvoiceHtml(data: InvoiceRenderData): string {
  const {
    invoiceNumber,
    status,
    amountCents,
    currency,
    taxPct,
    issuedDate,
    dueDate,
    paidDate,
    description,
    lineItems,
    client,
    partnerName,
    partnerEmail,
  } = data;

  const subtotalCents = lineItems.reduce(
    (s, li) => s + li.quantity * li.unitPriceCents,
    0
  );
  const taxCents = amountCents - subtotalCents;

  const statusCfg = STATUS_COLORS[status] ?? {
    bg: "#f3f4f6",
    color: "#374151",
  };
  const statusLabel = STATUS_LABELS[status] ?? status;

  const lineItemRows = lineItems
    .map(
      (li) => `
    <tr>
      <td class="td-desc">${esc(li.description)}</td>
      <td class="td-right">${li.quantity % 1 === 0 ? li.quantity : li.quantity.toFixed(2)}</td>
      <td class="td-right">${formatCurrency(li.unitPriceCents, currency)}</td>
      <td class="td-right td-total">${formatCurrency(
        li.quantity * li.unitPriceCents,
        currency
      )}</td>
    </tr>`
    )
    .join("");

  const paidRow =
    status === "paid" && paidDate
      ? `<tr>
           <td class="meta-label">Data pagamento:</td>
           <td class="meta-value">${formatDate(paidDate)}</td>
         </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fattura ${esc(invoiceNumber)}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
      font-size: 13px;
      color: #1a1a2e;
      background: #ffffff;
      width: 210mm;
      min-height: 297mm;
      padding: 0;
    }

    .page {
      padding: 40px 48px 48px;
      display: flex;
      flex-direction: column;
      min-height: 297mm;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 32px;
      border-bottom: 2px solid #1a1a2e;
      margin-bottom: 36px;
    }

    .brand-name {
      font-size: 22px;
      font-weight: 800;
      color: #1a1a2e;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    .brand-tagline {
      font-size: 11px;
      color: #6b7280;
      margin-top: 4px;
      font-weight: 400;
    }

    .invoice-title-block {
      text-align: right;
    }

    .invoice-title {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a2e;
      line-height: 1;
      letter-spacing: -0.5px;
    }

    .invoice-number {
      font-size: 14px;
      color: #6b7280;
      margin-top: 6px;
      font-weight: 500;
    }

    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      margin-top: 8px;
      background-color: ${statusCfg.bg};
      color: ${statusCfg.color};
    }

    /* ── Parties ── */
    .parties {
      display: flex;
      gap: 48px;
      margin-bottom: 36px;
    }

    .party-block {
      flex: 1;
    }

    .party-heading {
      font-size: 10px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }

    .party-name {
      font-size: 15px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 4px;
    }

    .party-detail {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.7;
    }

    /* ── Meta table ── */
    .meta-table {
      border-collapse: collapse;
      margin-bottom: 36px;
      background: #f8fafc;
      border-radius: 8px;
      overflow: hidden;
      width: 100%;
    }

    .meta-table td {
      padding: 10px 16px;
      font-size: 12px;
    }

    .meta-label {
      color: #6b7280;
      font-weight: 600;
      width: 160px;
    }

    .meta-value {
      color: #1a1a2e;
      font-weight: 500;
    }

    /* ── Description ── */
    .description-block {
      margin-bottom: 28px;
      padding: 14px 16px;
      background: #f8fafc;
      border-left: 3px solid #1a1a2e;
      border-radius: 0 6px 6px 0;
      font-size: 12px;
      color: #374151;
      line-height: 1.6;
    }

    /* ── Line items table ── */
    .items-heading {
      font-size: 11px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .items-table thead tr {
      border-bottom: 2px solid #e2e8f0;
    }

    .items-table th {
      padding: 8px 0;
      font-size: 11px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .items-table th:first-child {
      text-align: left;
    }

    .items-table th:not(:first-child) {
      text-align: right;
    }

    .items-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
    }

    .td-desc {
      padding: 12px 0;
      font-size: 13px;
      color: #374151;
      line-height: 1.4;
    }

    .td-right {
      padding: 12px 0;
      font-size: 13px;
      color: #6b7280;
      text-align: right;
      white-space: nowrap;
    }

    .td-total {
      font-weight: 600;
      color: #1a1a2e;
    }

    /* ── Totals ── */
    .totals {
      display: flex;
      justify-content: flex-end;
    }

    .totals-grid {
      width: 280px;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
      font-size: 13px;
    }

    .totals-row.final {
      border-top: 2px solid #1a1a2e;
      margin-top: 8px;
      padding-top: 10px;
      font-size: 15px;
      font-weight: 700;
    }

    .totals-label {
      color: #6b7280;
    }

    .totals-value {
      font-weight: 600;
      color: #1a1a2e;
    }

    .totals-row.final .totals-label,
    .totals-row.final .totals-value {
      color: #1a1a2e;
    }

    /* ── Footer ── */
    .footer {
      margin-top: auto;
      padding-top: 32px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 11px;
      color: #6b7280;
      line-height: 1.8;
    }

    .footer strong {
      color: #374151;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <header class="header">
    <div>
      <div class="brand-name">Roberto Scrigna</div>
      <div class="brand-tagline">Nutrizionista &amp; Personal Trainer</div>
    </div>
    <div class="invoice-title-block">
      <div class="invoice-title">FATTURA</div>
      <div class="invoice-number">${esc(invoiceNumber)}</div>
      <div class="status-badge">${esc(statusLabel)}</div>
    </div>
  </header>

  <!-- Issuer + Client -->
  <div class="parties">
    <div class="party-block">
      <div class="party-heading">Emessa da</div>
      <div class="party-name">${esc(partnerName)}</div>
      <div class="party-detail">
        ${esc(partnerEmail)}
      </div>
    </div>
    <div class="party-block">
      <div class="party-heading">Fatturato a</div>
      <div class="party-name">${esc(client?.full_name ?? "—")}</div>
      <div class="party-detail">
        ${client?.email ? esc(client.email) + "<br/>" : ""}${
          client?.phone ? esc(client.phone) : ""
        }
      </div>
    </div>
  </div>

  <!-- Dates meta -->
  <table class="meta-table">
    <tbody>
      <tr>
        <td class="meta-label">Data emissione:</td>
        <td class="meta-value">${formatDate(issuedDate)}</td>
        <td class="meta-label">Scadenza pagamento:</td>
        <td class="meta-value">${formatDate(dueDate)}</td>
      </tr>
      ${paidRow ? `<tr><td class="meta-label">Data pagamento:</td><td class="meta-value">${formatDate(paidDate)}</td><td></td><td></td></tr>` : ""}
    </tbody>
  </table>

  ${
    description
      ? `<div class="description-block">${esc(description)}</div>`
      : ""
  }

  <!-- Line items -->
  <div class="items-heading">Voci</div>
  <table class="items-table">
    <thead>
      <tr>
        <th>Descrizione</th>
        <th>Qtà</th>
        <th>Prezzo unit.</th>
        <th>Totale</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemRows || `<tr><td colspan="4" style="padding:16px 0; color:#6b7280; font-size:12px;">Nessuna voce.</td></tr>`}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals">
    <div class="totals-grid">
      <div class="totals-row">
        <span class="totals-label">Subtotale</span>
        <span class="totals-value">${formatCurrency(subtotalCents, currency)}</span>
      </div>
      <div class="totals-row">
        <span class="totals-label">IVA (${taxPct}%)</span>
        <span class="totals-value">${formatCurrency(taxCents, currency)}</span>
      </div>
      <div class="totals-row final">
        <span class="totals-label">Totale</span>
        <span class="totals-value">${formatCurrency(amountCents, currency)}</span>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <footer class="footer">
    <strong>Roberto Scrigna</strong> &mdash; Nutrizionista &amp; Personal Trainer<br />
    ${esc(partnerEmail)}<br />
    Grazie per la fiducia.
  </footer>

</div>
</body>
</html>`;
}
