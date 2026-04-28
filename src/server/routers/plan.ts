/**
 * Plan router — generation, retrieval, approval, and listing.
 *
 * Wires the plan generation pipeline (services/plan-generator) to tRPC.
 * The plan table stores the full serialized plan bundle (reportData +
 * engine intermediates) as JSONB in a "plan_bundle" column so the review
 * UI and PDF renderer never need to re-run the engine.
 *
 * DB columns used beyond the schema baseline:
 *   plan.plan_bundle  JSONB  — SerializedPlanResult (reportData + all engine results)
 *   plan.macro_payload JSONB — condensed weekly-average summary for the list view
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { inngest } from "../../lib/inngest/client";
import {
  generatePlan,
  serializePlanResult,
} from "../../services/plan-generator";
import type { PlanGenerationInput } from "../../services/plan-generator";
import type { ClientSnapshot, DayType } from "../../engine/types";
import type { PdfClientInfo } from "../../pdf/types";
import { getResend, FROM_EMAIL } from "../../lib/resend/client";

// ── Email helpers (shared with inngest functions) ────────────────────────────

function emailWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:#1a1a2e;padding:24px 32px;">
              <p style="margin:0;font-size:13px;color:#9ca3af;">Roberto Scrigna — Nutrizione Sportiva</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:11px;color:#d1d5db;text-align:center;">
                Roberto Scrigna — Nutrizione Sportiva · Portale Clienti
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btnHtml(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-top:20px;">${label}</a>`;
}

function portalUrl(path = ""): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://app.robertoscrigna.it";
  return `${base}/portal${path}`;
}

// ── Input schemas ────────────────────────────────────────────────────────────

const generatePlanSchema = z.object({
  clientId: z.string().uuid(),
  mealCount: z.number().min(3).max(6).optional().default(4),
  excludeAllergens: z.array(z.string()).optional(),
  preferTags: z.array(z.string()).optional(),
  maintenanceKcalEstimate: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map a raw client_snapshot DB row into a ClientSnapshot for the engine.
 * The snapshot row stores sex on the client table, so both are passed in.
 */
function buildEngineSnapshot(
  snapshotRow: Record<string, unknown>,
  clientSex: "male" | "female"
): ClientSnapshot {
  // Parse skinfold data from JSONB
  const skinfoldRaw = snapshotRow.skinfold_data as Record<string, unknown> | null;

  let skinfold7: ClientSnapshot["skinfold7"];
  let skinfold3: ClientSnapshot["skinfold3"];
  let bodyFatPctOverride: number | undefined;

  if (skinfoldRaw) {
    if (skinfoldRaw.method === "7site") {
      skinfold7 = {
        chest: Number(skinfoldRaw.chest ?? 0),
        midaxillary: Number(skinfoldRaw.midaxillary ?? 0),
        tricep: Number(skinfoldRaw.tricep ?? 0),
        subscapular: Number(skinfoldRaw.subscapular ?? 0),
        abdominal: Number(skinfoldRaw.abdominal ?? 0),
        suprailiac: Number(skinfoldRaw.suprailiac ?? 0),
        thigh: Number(skinfoldRaw.thigh ?? 0),
      };
    } else if (skinfoldRaw.method === "3site") {
      if (clientSex === "male") {
        skinfold3 = {
          chest: Number(skinfoldRaw.chest ?? 0),
          abdominal: Number(skinfoldRaw.abdominal ?? 0),
          thigh: Number(skinfoldRaw.thigh ?? 0),
        };
      } else {
        skinfold3 = {
          tricep: Number(skinfoldRaw.tricep ?? 0),
          suprailiac: Number(skinfoldRaw.suprailiac ?? 0),
          thigh: Number(skinfoldRaw.thigh ?? 0),
        };
      }
    } else if (skinfoldRaw.method === "override") {
      bodyFatPctOverride = Number(skinfoldRaw.bodyFatPctOverride) || undefined;
    }
  }

  // week_schedule from DB is a TEXT[] of 7 day types
  const rawSchedule = (snapshotRow.week_schedule as string[] | null) ?? [
    "training",
    "rest",
    "training",
    "rest",
    "training",
    "rest",
    "rest",
  ];
  const weekSchedule = rawSchedule as [
    DayType,
    DayType,
    DayType,
    DayType,
    DayType,
    DayType,
    DayType,
  ];

  return {
    sex: clientSex,
    ageYears: Number(snapshotRow.age_years ?? 30),
    weightKg: Number(snapshotRow.weight_kg ?? 70),
    heightCm: Number(snapshotRow.height_cm ?? 170),
    dailySteps: Number(snapshotRow.daily_steps ?? 6000),
    occupationalLevel:
      (snapshotRow.occupational_level as ClientSnapshot["occupationalLevel"]) ??
      "sedentary",
    weekSchedule,
    skinfold7,
    skinfold3,
    bodyFatPctOverride,
  };
}

// ── Router ───────────────────────────────────────────────────────────────────

export const planRouter = router({
  /**
   * Generate a complete nutrition plan for a client.
   * Reads the latest client snapshot, runs the full pipeline, stores the result.
   */
  generate: protectedProcedure
    .input(generatePlanSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch client (verify ownership + get personal data)
      const { data: client, error: clientError } = await ctx.supabase
        .from("client")
        .select("id, full_name, email, phone, date_of_birth, sex, status")
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

      // 2. Fetch the latest snapshot
      const { data: snapshotRow, error: snapshotError } = await ctx.supabase
        .from("client_snapshot")
        .select("*")
        .eq("client_id", input.clientId)
        .order("taken_at", { ascending: false })
        .limit(1)
        .single();

      if (snapshotError || !snapshotRow) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Nessuna misurazione trovata per questo cliente. Completa prima il modulo di intake.",
        });
      }

      // 3. Build engine snapshot
      const clientSex: "male" | "female" =
        (client.sex as "male" | "female") ?? "male";
      const snapshot = buildEngineSnapshot(
        snapshotRow as unknown as Record<string, unknown>,
        clientSex
      );

      // 4. Build client info for PDF cover
      const planDate = new Date().toISOString().split("T")[0]!;
      const clientInfo: PdfClientInfo = {
        fullName: client.full_name,
        email: client.email ?? undefined,
        phone: client.phone ?? undefined,
        dateOfBirth: client.date_of_birth ?? undefined,
        planDate,
      };

      // 5. Build generation input
      const genInput: PlanGenerationInput = {
        clientInfo,
        snapshot,
        mealCount: input.mealCount,
        excludeAllergens: input.excludeAllergens as PlanGenerationInput["excludeAllergens"],
        preferTags: input.preferTags as PlanGenerationInput["preferTags"],
        maintenanceKcalEstimate: input.maintenanceKcalEstimate,
      };

      // 6. Run the pipeline (pure, synchronous)
      let result;
      try {
        result = generatePlan(genInput);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? `Errore nella generazione del piano: ${err.message}`
              : "Errore sconosciuto durante la generazione del piano.",
        });
      }

      const serialized = serializePlanResult(result);

      // 7. Derive the macro payload summary for quick display in the list view
      const uniqueDayTypes = [...new Set(snapshot.weekSchedule)];
      const macroPayload: Record<string, unknown> = {
        weeklyAverageKcal: result.weeklyPlan.weeklyAverageKcal,
        weeklyAverageProteinG: result.weeklyPlan.weeklyAverageProteinG,
        dayTypes: uniqueDayTypes,
        energyBalance: result.energyBalance,
      };

      // 8. Persist plan to DB
      // plan_bundle and macro_payload are stored in daily_targets JSONB for now
      // (the schema already has daily_targets JSONB; we overload it to carry the
      //  full serialized result to avoid a migration while still being queryable).
      const planName = `Piano ${client.full_name} — ${planDate}`;

      const { data: plan, error: planError } = await ctx.supabase
        .from("plan")
        .insert({
          client_id: input.clientId,
          snapshot_id: snapshotRow.id,
          partner_id: ctx.partnerId,
          name: planName,
          status: "draft",
          daily_targets: {
            macro_payload: macroPayload,
            plan_bundle: serialized,
          },
          meals_per_day: input.mealCount,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: planError?.message ?? "Errore nel salvataggio del piano.",
        });
      }

      return {
        planId: plan.id,
        planName,
        weeklyAverageKcal: result.weeklyPlan.weeklyAverageKcal,
        energyBalance: result.energyBalance,
      };
    }),

  /**
   * Retrieve a single plan by ID with full bundle for the review UI.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: plan, error } = await ctx.supabase
        .from("plan")
        .select(
          "id, name, status, created_at, client_id, daily_targets, notes, meals_per_day"
        )
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (error || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Piano non trovato.",
        });
      }

      // Fetch client name for the header
      const { data: client } = await ctx.supabase
        .from("client")
        .select("full_name, email")
        .eq("id", plan.client_id)
        .single();

      // Extract typed payloads from JSONB
      const dailyTargets = plan.daily_targets as Record<string, unknown> | null;
      const macroPayload = (dailyTargets?.macro_payload as Record<string, unknown>) ?? {};
      const planBundle = dailyTargets?.plan_bundle ?? null;

      return {
        id: plan.id,
        name: plan.name,
        status: plan.status as "draft" | "active" | "completed" | "archived",
        createdAt: plan.created_at,
        clientName: client?.full_name ?? "Cliente sconosciuto",
        macroPayload,
        planBundle,
        notes: plan.notes,
      };
    }),

  /**
   * Approve a plan (set status → active).
   */
  approve: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership first — include client_id so we can dispatch the event
      const { data: plan } = await ctx.supabase
        .from("plan")
        .select("id, client_id")
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Piano non trovato.",
        });
      }

      const { error } = await ctx.supabase
        .from("plan")
        .update({ status: "active" })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/plan.approve]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nell'aggiornamento. Riprova.",
        });
      }

      // Fetch client name for the Inngest event
      const { data: client } = await ctx.supabase
        .from("client")
        .select("full_name")
        .eq("id", plan.client_id)
        .single();

      // Dispatch plan/delivered event — wrapped so a dispatch failure never breaks the response
      try {
        await inngest.send({
          name: "plan/delivered",
          data: {
            planId: plan.id,
            clientId: plan.client_id,
            clientName: client?.full_name ?? "Cliente",
            partnerId: ctx.partnerId,
          },
        });
      } catch (err) {
        console.error("[router/plan.approve] inngest.send failed:", err);
      }

      return { success: true, planId: input.id };
    }),

  /**
   * Share a plan with the client via email.
   * Sends a branded HTML email with a summary of kcal/macro targets and a
   * portal link. The email address can be overridden; defaults to the client's
   * stored email.
   */
  shareWithClient: protectedProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch the plan (verify ownership)
      const { data: plan, error: planError } = await ctx.supabase
        .from("plan")
        .select("id, name, status, client_id, daily_targets")
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (planError || !plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Piano non trovato.",
        });
      }

      if (plan.status === "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Il piano deve essere approvato prima di essere condiviso.",
        });
      }

      // 2. Fetch client data
      const { data: client, error: clientError } = await ctx.supabase
        .from("client")
        .select("full_name, email")
        .eq("id", plan.client_id)
        .single();

      if (clientError || !client) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cliente non trovato.",
        });
      }

      const recipientEmail = input.email ?? client.email;
      if (!recipientEmail) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nessun indirizzo email disponibile per questo cliente.",
        });
      }

      // 3. Extract macro summary from the stored bundle
      const dailyTargets = plan.daily_targets as Record<string, unknown> | null;
      const macroPayload = (dailyTargets?.macro_payload as Record<string, unknown>) ?? {};
      const planBundle = dailyTargets?.plan_bundle as Record<string, unknown> | null;

      const weeklyAvgKcal = macroPayload.weeklyAverageKcal as number | undefined;
      const energyBalance = macroPayload.energyBalance as string | undefined;

      // Pull per-day-type macro targets from the bundle if present
      const reportData = planBundle?.reportData as Record<string, unknown> | null;
      const dayTypePlans = reportData?.dayTypePlans as Array<Record<string, unknown>> | undefined;
      const firstDay = dayTypePlans?.[0];
      const firstMacros = firstDay?.macros as Record<string, unknown> | undefined;

      const proteinG = firstMacros?.proteinG != null ? Math.round(firstMacros.proteinG as number) : null;
      const carbG = firstMacros?.carbG != null ? Math.round(firstMacros.carbG as number) : null;
      const fatG = firstMacros?.fatG != null ? Math.round(firstMacros.fatG as number) : null;

      // 4. Build the email
      const energyLabels: Record<string, string> = {
        deficit: "Deficit Calorico",
        surplus: "Surplus Calorico",
        maintenance: "Mantenimento",
      };
      const energyLabel = energyLabels[energyBalance ?? ""] ?? "Piano Nutrizionale";

      const macroRows = [
        weeklyAvgKcal != null
          ? `<tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;font-weight:600;">Media kcal/giorno</td><td style="padding:10px 16px;font-size:14px;color:#1a1a2e;font-weight:700;text-align:right;">${weeklyAvgKcal.toLocaleString("it-IT")} kcal</td></tr>`
          : "",
        proteinG != null
          ? `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:13px;color:#6b7280;font-weight:600;">Proteine</td><td style="padding:10px 16px;font-size:14px;color:#3b82f6;font-weight:700;text-align:right;">${proteinG}g</td></tr>`
          : "",
        carbG != null
          ? `<tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;font-weight:600;">Carboidrati</td><td style="padding:10px 16px;font-size:14px;color:#8b5cf6;font-weight:700;text-align:right;">${carbG}g</td></tr>`
          : "",
        fatG != null
          ? `<tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:13px;color:#6b7280;font-weight:600;">Grassi</td><td style="padding:10px 16px;font-size:14px;color:#10b981;font-weight:700;text-align:right;">${fatG}g</td></tr>`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const macroTable =
        macroRows.length > 0
          ? `<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:4px;">${macroRows}</table>`
          : "";

      const html = emailWrapper(
        `Il tuo piano nutrizionale è pronto — ${plan.name}`,
        `<h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Il tuo piano nutrizionale è pronto!</h2>
<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
  Ciao ${client.full_name},<br/>
  il tuo piano nutrizionale personalizzato è stato preparato ed è disponibile nel portale.
</p>
<p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
  Strategia: <strong style="color:#1a1a2e;">${energyLabel}</strong>
</p>
${macroTable}
${btnHtml(portalUrl("/dashboard"), "Visualizza il piano")}
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
  Hai domande? Rispondi a questa email o contatta direttamente il tuo coach.
</p>`
      );

      // 5. Send via Resend
      try {
        await getResend().emails.send({
          from: FROM_EMAIL,
          to: recipientEmail,
          subject: `Il tuo piano nutrizionale è pronto — ${plan.name}`,
          html,
        });
      } catch (err) {
        console.error("[router/plan.shareWithClient] Resend error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nell'invio dell'email. Riprova tra poco.",
        });
      }

      return { success: true, sentTo: recipientEmail };
    }),

  /**
   * List all plans for the authenticated partner with client names.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "active", "completed", "archived"])
            .optional(),
          clientId: z.string().uuid().optional(),
          limit: z.number().min(1).max(100).optional(),
          offset: z.number().min(0).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      let query = ctx.supabase
        .from("plan")
        .select(
          "id, name, status, created_at, client_id, daily_targets, meals_per_day",
          { count: "exact" }
        )
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (input?.status) {
        query = query.eq("status", input.status);
      }
      if (input?.clientId) {
        query = query.eq("client_id", input.clientId);
      }

      const { data: plans, count, error } = await query;

      if (error) {
        console.error("[router/plan.list]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel caricamento dei dati.",
        });
      }

      if (!plans || plans.length === 0) {
        return { plans: [], total: 0 };
      }

      // Batch-fetch client names
      const clientIds = [...new Set(plans.map((p) => p.client_id))];
      const { data: clients } = await ctx.supabase
        .from("client")
        .select("id, full_name")
        .in("id", clientIds);

      const clientMap = new Map<string, string>(
        (clients ?? []).map((c) => [c.id, c.full_name])
      );

      const items = plans.map((plan) => {
        const dailyTargets = plan.daily_targets as Record<string, unknown> | null;
        const macroPayload = (dailyTargets?.macro_payload as Record<string, unknown>) ?? {};

        return {
          id: plan.id,
          name: plan.name,
          status: plan.status as string,
          createdAt: plan.created_at,
          clientId: plan.client_id,
          clientName: clientMap.get(plan.client_id) ?? "Sconosciuto",
          weeklyAvgKcal: (macroPayload.weeklyAverageKcal as number) ?? 0,
          dayTypes: (macroPayload.dayTypes as string[]) ?? [],
          energyBalance:
            (macroPayload.energyBalance as string) ?? "maintenance",
        };
      });

      return { plans: items, total: count ?? 0 };
    }),
});
