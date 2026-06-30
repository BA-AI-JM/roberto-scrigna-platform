/**
 * Feedback Router — urgent-feedback + injury-report channel (Build #28).
 *
 * A SEPARATE channel from the 3-weekly structured feedback (check_in) and NOT
 * real-time chat. The client submits an urgent note or a structured injury
 * report; we PERSIST it (urgent_feedback) and create a HIGH-PRIORITY coach
 * notification (reusing the notification table, so the #2 per-client feed
 * surfaces it). It MUST NOT auto-regenerate the plan — regeneration stays manual
 * (per Roberto's heuristics).
 *
 * Procedures (client-scoped):
 * - submitUrgent          capture an urgent feedback / injury report + notify coach
 * - getMyUrgentSubmissions the client's own submissions + status
 *
 * Data access uses the service-role client (like the portal router), scoped
 * manually by ctx.clientId; the RLS policies in migration 013 are defence-in-depth.
 */

import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, clientProcedure, protectedProcedure } from "../trpc";
import { createSupabaseServiceRole } from "../../lib/supabase/service";

/** Service-role client (RLS bypass — scope by ctx.clientId in code). */
function svc() {
  return createSupabaseServiceRole();
}

/** A real calendar date in YYYY-MM-DD (rejects 2026-02-31 etc., not just the shape). */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (YYYY-MM-DD).")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Data inesistente.");

const injurySchema = z.object({
  area: z.string().min(1).max(200),
  severity: z.string().min(1).max(100),
  onsetDate: calendarDate,
  limitations: z.string().max(2000).optional(),
});

export const feedbackRouter = router({
  /**
   * Capture an urgent feedback note or a structured injury report, and alert the
   * coach with a HIGH-PRIORITY notification. Never mutates the plan.
   */
  submitUrgent: clientProcedure
    .input(
      z
        .object({
          kind: z.enum(["urgent_feedback", "injury_report"]),
          message: z.string().min(1).max(2000),
          injury: injurySchema.optional(),
        })
        // injury details are required for (and only meaningful for) injury reports.
        .refine((d) => d.kind !== "injury_report" || d.injury !== undefined, {
          message: "Dettagli dell'infortunio richiesti per una segnalazione infortunio.",
          path: ["injury"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      const db = svc();

      const { data: client, error: clientErr } = await db
        .from("client")
        .select("id, partner_id, full_name")
        .eq("id", ctx.clientId)
        .single();
      if (clientErr || !client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      const isInjury = input.kind === "injury_report";

      // 1. Persist the submission (scoped to the caller).
      const { data: row, error: insErr } = await db
        .from("urgent_feedback")
        .insert({
          client_id: ctx.clientId,
          partner_id: client.partner_id,
          kind: input.kind,
          message: input.message,
          injury_area: isInjury ? input.injury!.area : null,
          injury_severity: isInjury ? input.injury!.severity : null,
          injury_onset: isInjury ? input.injury!.onsetDate : null,
          limitations: isInjury ? input.injury!.limitations ?? null : null,
          status: "open",
        })
        .select("id, kind, status, created_at")
        .single();
      if (insErr || !row) {
        console.error("[router/feedback.submitUrgent:insert]", insErr);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nell'invio. Riprova.",
        });
      }

      // 2. HIGH-PRIORITY coach notification (the #2 feed surfaces 'urgent').
      const clientName = (client.full_name as string | null) ?? "Cliente";
      const title = isInjury
        ? `Infortunio segnalato da ${clientName}`
        : `Feedback urgente da ${clientName}`;
      const body = isInjury
        ? `${clientName} ha segnalato un infortunio${
            input.injury!.area ? ` (${input.injury!.area})` : ""
          }: ${input.message}`
        : `${clientName}: ${input.message}`;

      const { error: notifErr } = await db.from("notification").insert({
        partner_id: client.partner_id,
        client_id: ctx.clientId,
        trigger: "urgent_feedback",
        priority: "urgent",
        title,
        body,
        metadata: {
          kind: input.kind,
          urgentFeedbackId: row.id,
          ...(isInjury
            ? { injuryArea: input.injury!.area, injurySeverity: input.injury!.severity }
            : {}),
        },
        read: false,
      });
      // BEST-EFFORT: the submission is the durable record (coach reads it via
      // getClientUrgentSubmissions). A notification hiccup must NOT make the client
      // retry (which would duplicate the submission) — log and proceed.
      if (notifErr) {
        console.error("[router/feedback.submitUrgent:notify]", notifErr);
      }

      // NOTE: deliberately NO plan mutation — #28 only captures + notifies.
      return { id: row.id as string, kind: row.kind as string, status: row.status as string };
    }),

  /** The client's own urgent submissions + status, newest first. */
  getMyUrgentSubmissions: clientProcedure.query(async ({ ctx }) => {
    const db = svc();
    const { data, error } = await db
      .from("urgent_feedback")
      .select(
        "id, kind, message, injury_area, injury_severity, injury_onset, limitations, status, created_at"
      )
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[router/feedback.getMyUrgentSubmissions]", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Errore nel caricamento dei dati.",
      });
    }

    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      kind: r.kind as string,
      message: r.message as string,
      status: r.status as string,
      createdAt: r.created_at as string,
      injury: r.injury_area
        ? {
            area: r.injury_area as string,
            severity: (r.injury_severity as string | null) ?? null,
            onsetDate: (r.injury_onset as string | null) ?? null,
            limitations: (r.limitations as string | null) ?? null,
          }
        : null,
    }));
  }),

  /**
   * Coach-facing durable read of a client's urgent submissions (the structured
   * record behind the notification). Partner-scoped — only the client's own coach.
   * This makes the notification a supplementary alert, not the sole surface.
   */
  getClientUrgentSubmissions: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("urgent_feedback")
        .select(
          "id, client_id, kind, message, injury_area, injury_severity, injury_onset, limitations, status, created_at"
        )
        .eq("client_id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[router/feedback.getClientUrgentSubmissions]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel caricamento dei dati.",
        });
      }
      return data ?? [];
    }),

  /** Coach marks an urgent submission addressed. Partner-scoped. No plan mutation. */
  markAddressed: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("urgent_feedback")
        .update({ status: "addressed" })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);
      if (error) {
        console.error("[router/feedback.markAddressed]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nell'aggiornamento. Riprova.",
        });
      }
      return { success: true };
    }),
});
