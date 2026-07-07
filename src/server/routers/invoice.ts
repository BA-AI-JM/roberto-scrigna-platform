/**
 * Invoice Router
 *
 * tRPC procedures for the invoicing system:
 * - list: paginated list of invoices for the partner
 * - getById: single invoice detail
 * - create: draft invoice with line items
 * - update: edit draft or overwrite fields
 * - updateStatus: mark as sent, paid, overdue, cancelled
 * - delete: soft-delete (cancelled + deleted_at)
 * - getSummary: aggregate stats (total outstanding, paid this month)
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { inngest } from "../../lib/inngest/client";

// ── Schemas ──────────────────────────────────────────────────────────────────

/** A single invoice line item */
const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0.01).max(9999),
  unitPriceCents: z.number().int().min(0),
  /** Optional VAT / tax rate for this specific line */
  taxPct: z.number().min(0).max(100).optional(),
});

/** Invoice status values */
const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
]);

/** Schema for creating a new invoice */
const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  description: z.string().max(1000).optional(),
  lineItems: z.array(lineItemSchema).min(1).max(50),
  /** Overall tax percentage (applied if line item has no individual taxPct) */
  taxPct: z.number().min(0).max(100).optional(),
  currency: z.string().length(3).default("EUR"),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data: YYYY-MM-DD").optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data: YYYY-MM-DD").optional(),
});

/** Schema for updating an invoice */
const updateInvoiceSchema = createInvoiceSchema
  .partial()
  .extend({ id: z.string().uuid() });

/** Schema for updating invoice status */
const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: invoiceStatusSchema,
  /** Required when marking as paid */
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data: YYYY-MM-DD").optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate total amount in cents from line items and tax rate.
 */
function calcTotalCents(
  items: Array<{ quantity: number; unitPriceCents: number; taxPct?: number }>,
  defaultTaxPct: number
): number {
  return items.reduce((sum, item) => {
    const taxRate = (item.taxPct ?? defaultTaxPct) / 100;
    const lineTotal = item.quantity * item.unitPriceCents;
    return sum + Math.round(lineTotal * (1 + taxRate));
  }, 0);
}

/**
 * Generate a sequential invoice number: RS-YYYY-NNNN
 * Queries the highest existing number for the current year.
 */
/** Bounded retries when a concurrent create grabs the same RS-YYYY-NNNN number. */
const MAX_INVOICE_CREATE_ATTEMPTS = 5;

async function generateInvoiceNumber(
  supabase: Awaited<ReturnType<typeof import("../trpc").createTrpcContext>>["supabase"],
  partnerId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RS-${year}-`;

  const { data } = await supabase
    .from("invoice")
    .select("invoice_number")
    .eq("partner_id", partnerId)
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);

  const lastNumber = data?.[0]?.invoice_number;
  let sequence = 1;

  if (lastNumber) {
    const parts = lastNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, "0")}`;
}

// ── Router ───────────────────────────────────────────────────────────────────

/** Invoice tRPC router */
export const invoiceRouter = router({
  /**
   * List all invoices for the partner, with optional filters.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: invoiceStatusSchema.optional(),
        clientId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("invoice")
        .select(
          `id, invoice_number, status, amount_cents, currency, tax_pct,
           issued_date, due_date, paid_date, description, line_items,
           created_at, updated_at,
           client:client_id (id, full_name, email)`
        )
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.status) {
        query = query.eq("status", input.status);
      }
      if (input.clientId) {
        query = query.eq("client_id", input.clientId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[router/invoice.list]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel caricamento dei dati.",
        });
      }

      return data ?? [];
    }),

  /**
   * Get a single invoice by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("invoice")
        .select(
          `id, invoice_number, status, amount_cents, currency, tax_pct,
           issued_date, due_date, paid_date, description, line_items,
           created_at, updated_at,
           client:client_id (id, full_name, email, phone)`
        )
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Fattura non trovata.",
        });
      }

      return data;
    }),

  /**
   * Create a new invoice in draft status.
   * Auto-generates invoice number (RS-YYYY-NNNN).
   */
  create: protectedProcedure
    .input(createInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify client belongs to this partner
      const { data: client, error: clientError } = await ctx.supabase
        .from("client")
        .select("id")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (clientError || !client) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cliente non trovato.",
        });
      }

      const taxPct = input.taxPct ?? 0;
      const amountCents = calcTotalCents(input.lineItems, taxPct);

      // Read-then-increment (generateInvoiceNumber) can race under concurrent
      // creates → two invoices computing the same RS-YYYY-NNNN → a PER-PARTNER
      // unique violation (idx_invoice_number_partner, migration 016). Recompute
      // the number and retry a bounded number of times so a race doesn't 500.
      let created: { id: string; invoice_number: string } | null = null;
      let lastError: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < MAX_INVOICE_CREATE_ATTEMPTS; attempt++) {
        const invoiceNumber = await generateInvoiceNumber(ctx.supabase, ctx.partnerId);

        const { data, error } = await ctx.supabase
          .from("invoice")
          .insert({
            client_id: input.clientId,
            partner_id: ctx.partnerId,
            invoice_number: invoiceNumber,
            status: "draft" as const,
            amount_cents: amountCents,
            currency: input.currency,
            tax_pct: taxPct,
            description: input.description ?? null,
            line_items: input.lineItems,
            issued_date: input.issuedDate ?? new Date().toISOString().split("T")[0],
            due_date: input.dueDate ?? null,
          })
          .select("id, invoice_number")
          .single();

        if (!error && data) {
          created = data as { id: string; invoice_number: string };
          break;
        }
        // 23505 = unique_violation on the invoice number → a concurrent create
        // grabbed it; recompute + retry. Any other error → fail immediately.
        if (error?.code === "23505") {
          lastError = error;
          continue;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nella creazione della fattura.",
        });
      }

      if (!created) {
        console.error("[router/invoice.create] number-conflict retries exhausted", lastError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella creazione della fattura. Riprova.",
        });
      }

      return { id: created.id, invoiceNumber: created.invoice_number };
    }),

  /**
   * Update a draft invoice. Only draft invoices can be fully edited.
   */
  update: protectedProcedure
    .input(updateInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch current invoice to verify ownership and status
      const { data: existing, error: fetchError } = await ctx.supabase
        .from("invoice")
        .select("id, status")
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (fetchError || !existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fattura non trovata." });
      }

      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Solo le fatture in bozza possono essere modificate.",
        });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.description !== undefined) updates.description = input.description;
      if (input.dueDate !== undefined) updates.due_date = input.dueDate;
      if (input.issuedDate !== undefined) updates.issued_date = input.issuedDate;
      if (input.currency !== undefined) updates.currency = input.currency;

      if (input.lineItems !== undefined) {
        const taxPct = input.taxPct ?? 0;
        updates.line_items = input.lineItems;
        updates.tax_pct = taxPct;
        updates.amount_cents = calcTotalCents(input.lineItems, taxPct);
      } else if (input.taxPct !== undefined) {
        updates.tax_pct = input.taxPct;
      }

      const { error } = await ctx.supabase
        .from("invoice")
        .update(updates)
        .eq("id", input.id);

      if (error) {
        console.error("[router/invoice.update]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      return { success: true };
    }),

  /**
   * Transition invoice status.
   * Valid transitions: draft→sent, sent→paid, sent→overdue, any→cancelled.
   */
  updateStatus: protectedProcedure
    .input(updateStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: fetchError } = await ctx.supabase
        .from("invoice")
        .select("id, status, client_id, amount_cents, due_date")
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (fetchError || !existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Fattura non trovata." });
      }

      // Validate transition
      const validTransitions: Record<string, string[]> = {
        draft: ["sent", "cancelled"],
        sent: ["paid", "overdue", "cancelled"],
        overdue: ["paid", "cancelled"],
        paid: [],
        cancelled: [],
      };

      const allowed = validTransitions[existing.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Transizione non valida: ${existing.status} → ${input.status}.`,
        });
      }

      const updates: Record<string, unknown> = {
        status: input.status,
        updated_at: new Date().toISOString(),
      };

      if (input.status === "paid") {
        updates.paid_date =
          input.paidDate ?? new Date().toISOString().split("T")[0];
      }

      const { error } = await ctx.supabase
        .from("invoice")
        .update(updates)
        .eq("id", input.id);

      if (error) {
        console.error("[router/invoice.updateStatus]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      // Dispatch invoice/sent event when transitioning to 'sent'
      if (input.status === "sent") {
        try {
          // Fetch client name for the Inngest consumer (onInvoiceSent uses it directly)
          const { data: invoiceClient } = await ctx.supabase
            .from("client")
            .select("full_name")
            .eq("id", existing.client_id)
            .single();

          await inngest.send({
            name: "invoice/sent",
            data: {
              invoiceId: existing.id,
              clientId: existing.client_id,
              clientName: invoiceClient?.full_name ?? "Cliente",
              partnerId: ctx.partnerId,
              amountEur: (existing.amount_cents ?? 0) / 100,
              dueDate: existing.due_date ?? null,
            },
          });
        } catch (err) {
          console.error("[router/invoice.updateStatus] inngest.send failed:", err);
        }
      }

      return { success: true };
    }),

  /**
   * Soft-delete an invoice (sets deleted_at, status → cancelled).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("invoice")
        .update({
          status: "cancelled",
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/invoice.delete]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'eliminazione. Riprova." });
      }

      return { success: true };
    }),

  /**
   * Get summary statistics for the partner's invoices.
   * Returns: total outstanding, paid this month, overdue count.
   */
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("invoice")
      .select("status, amount_cents, paid_date, currency")
      .eq("partner_id", ctx.partnerId)
      .is("deleted_at", null);

    if (error) {
      console.error("[router/invoice.getSummary]", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
    }

    const invoices = data ?? [];
    const now = new Date();
    const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let outstandingCents = 0;
    let paidThisMonthCents = 0;
    let overdueCount = 0;

    for (const inv of invoices) {
      if (inv.status === "sent") outstandingCents += inv.amount_cents ?? 0;
      if (inv.status === "overdue") {
        outstandingCents += inv.amount_cents ?? 0;
        overdueCount++;
      }
      if (
        inv.status === "paid" &&
        inv.paid_date?.startsWith(thisMonthPrefix)
      ) {
        paidThisMonthCents += inv.amount_cents ?? 0;
      }
    }

    return {
      outstandingCents,
      paidThisMonthCents,
      overdueCount,
      totalInvoices: invoices.length,
    };
  }),
});
