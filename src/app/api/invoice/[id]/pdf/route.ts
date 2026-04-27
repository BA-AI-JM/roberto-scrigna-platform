/**
 * Invoice PDF generation endpoint.
 *
 * GET /api/invoice/[id]/pdf
 *
 * Fetches the invoice from Supabase (server-side, authenticated via cookie),
 * renders an HTML invoice template, and returns a PDF via Puppeteer.
 *
 * Uses @sparticuz/chromium + puppeteer-core for Vercel serverless compatibility.
 *
 * Returns: application/pdf with Content-Disposition: attachment
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { renderInvoiceHtml } from "@/pdf/invoice-renderer";
import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";

interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxPct?: number;
}

/**
 * Resolve the executable path for the Chromium/Chrome binary.
 * Mirrors the same logic in src/pdf/generator.ts.
 */
async function resolveExecutablePath(): Promise<string | undefined> {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }
  if (process.env.VERCEL) {
    return chromium.executablePath();
  }
  return undefined;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "ID fattura mancante." }, { status: 400 });
  }

  const supabase = await createSupabaseServer();

  // Verify session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Non autorizzato." },
      { status: 401 }
    );
  }

  // Get partner record
  const { data: partner } = await supabase
    .from("partner")
    .select("id, full_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json(
      { error: "Professionista non trovato." },
      { status: 403 }
    );
  }

  // Fetch invoice with client join
  const { data: invoice, error } = await supabase
    .from("invoice")
    .select(
      `id, invoice_number, status, amount_cents, currency, tax_pct,
       issued_date, due_date, paid_date, description, line_items,
       created_at,
       client:client_id (id, full_name, email, phone)`
    )
    .eq("id", id)
    .eq("partner_id", partner.id)
    .is("deleted_at", null)
    .single();

  if (error || !invoice) {
    return NextResponse.json(
      { error: "Fattura non trovata." },
      { status: 404 }
    );
  }

  // Render HTML
  const html = renderInvoiceHtml({
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    amountCents: invoice.amount_cents,
    currency: invoice.currency,
    taxPct: Number(invoice.tax_pct ?? 0),
    issuedDate: invoice.issued_date,
    dueDate: invoice.due_date,
    paidDate: invoice.paid_date,
    description: invoice.description,
    lineItems: (Array.isArray(invoice.line_items)
      ? invoice.line_items
      : []) as LineItem[],
    client: (invoice.client as unknown) as {
      full_name: string;
      email: string | null;
      phone: string | null;
    } | null,
    partnerName: partner.full_name,
    partnerEmail: partner.email,
  });

  // Generate PDF via puppeteer-core + @sparticuz/chromium
  const executablePath = await resolveExecutablePath();
  let pdfBuffer: Uint8Array;
  const browser = await puppeteerCore.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 800 },
    executablePath,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }

  const filename = `fattura-${invoice.invoice_number}.pdf`;

  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
