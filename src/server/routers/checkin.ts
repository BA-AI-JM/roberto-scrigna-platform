/**
 * Check-in Router
 *
 * tRPC procedures for the client check-in system:
 * - sendCheckin: generate token + send email link to client
 * - validateToken: verify a check-in token is valid
 * - submitCheckin: client submits check-in via token-authenticated form
 * - list: list check-ins for partner (with optional client filter)
 * - getById: single check-in with deviation flags
 * - batchReview: fetch pending check-ins with AI summary stubs
 * - markReviewed: mark a check-in as reviewed
 */

import { z } from "zod/v4";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { inngest } from "../../lib/inngest/client";
import { rateLimit, getClientIp } from "../../lib/rate-limit";
import { throwDiscriminated } from "../db-errors";

// ── Schemas ──────────────────────────────────────────────────────────────────

/** Weight deviation threshold in kg — flags if check-in weight differs by more than this */
const WEIGHT_DEVIATION_THRESHOLD_KG = 1.5;

/** Check-in questionnaire submission schema */
const checkinSubmissionSchema = z.object({
  token: z.string().uuid(),
  weightKg: z.number().min(30).max(300),
  waistCm: z.number().min(40).max(200).optional(),
  hipCm: z.number().min(50).max(200).optional(),
  energyLevel: z.number().int().min(1).max(10),
  sleepQuality: z.number().int().min(1).max(10),
  stressLevel: z.number().int().min(1).max(10),
  hungerLevel: z.number().int().min(1).max(10),
  digestiveHealth: z.number().int().min(1).max(10),
  adherencePct: z.number().int().min(0).max(100),
  trainingAdherence: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(5000).optional(),
  // Only allow https:// URLs to prevent javascript: or data: URI injection.
  // URLs are stored and later rendered as <img> src or download links.
  photos: z.array(z.string().url().startsWith("https://")).max(5).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Compute weight deviation flag from previous check-in or snapshot */
function computeWeightDeviation(
  currentKg: number,
  previousKg: number | null
): { deviationKg: number; flagged: boolean } | null {
  if (previousKg === null) return null;
  const deviationKg = currentKg - previousKg;
  return {
    deviationKg: Math.round(deviationKg * 100) / 100,
    flagged: Math.abs(deviationKg) > WEIGHT_DEVIATION_THRESHOLD_KG,
  };
}

/** Generate a simple AI summary stub from check-in data */
function generateCheckinSummary(data: {
  weightKg: number;
  energyLevel: number;
  sleepQuality: number;
  stressLevel: number;
  adherencePct: number;
  deviationKg: number | null;
}): string {
  const parts: string[] = [];

  if (data.deviationKg !== null) {
    const dir = data.deviationKg > 0 ? "+" : "";
    parts.push(`Peso: ${data.weightKg}kg (${dir}${data.deviationKg}kg)`);
  } else {
    parts.push(`Peso: ${data.weightKg}kg (primo check-in)`);
  }

  if (data.energyLevel <= 4) parts.push("⚠️ Energia bassa");
  if (data.sleepQuality <= 4) parts.push("⚠️ Sonno scarso");
  if (data.stressLevel >= 7) parts.push("⚠️ Stress elevato");
  if (data.adherencePct < 70) parts.push("⚠️ Aderenza sotto 70%");

  if (data.energyLevel >= 7 && data.sleepQuality >= 7 && data.adherencePct >= 85) {
    parts.push("✅ Buoni progressi generali");
  }

  return parts.join(" · ");
}

// ── Router ───────────────────────────────────────────────────────────────────

export const checkinRouter = router({
  /**
   * Send check-in request to a client.
   * Generates a unique token and stores it for token-based authentication.
   */
  sendCheckin: protectedProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data: YYYY-MM-DD").optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify client ownership
      const { data: client, error: clientError } = await ctx.supabase
        .from("client")
        .select("id, full_name, email")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (clientError) {
        throwDiscriminated(clientError, "Cliente non trovato.", "router/checkin.sendCheckin");
      }
      if (!client) {
        throwDiscriminated(null, "Cliente non trovato.", "router/checkin.sendCheckin");
      }

      if (!client.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Il cliente non ha un indirizzo email.",
        });
      }

      // Create check-in request with token
      const { data: checkin, error } = await ctx.supabase
        .from("check_in")
        .insert({
          client_id: input.clientId,
          partner_id: ctx.partnerId,
          status: "pending",
          due_date: input.dueDate ?? null,
          // G6: the emailed link promises 7 days — the consumed token now enforces it.
          token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id, token")
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message ?? "Errore nella creazione del check-in.",
        });
      }
      if (!checkin) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella creazione del check-in.",
        });
      }

      // Dispatch checkin/due event — wrapped so dispatch failure never breaks the response
      try {
        await inngest.send({
          name: "checkin/due",
          data: {
            checkinId: checkin.id,
            clientId: input.clientId,
            clientName: client.full_name,
            partnerId: ctx.partnerId,
            dueDate: input.dueDate ?? null,
          },
        });
      } catch (err) {
        console.error("[router/checkin.sendCheckin] inngest.send failed:", err);
      }

      return {
        checkinId: checkin.id,
        token: checkin.token,
        clientName: client.full_name,
        clientEmail: client.email,
      };
    }),

  /**
   * Validate a check-in token (public — used by client-facing form).
   */
  validateToken: publicProcedure
    .input(z.object({ token: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers);
      const { success } = rateLimit(`validateToken:${ip}`, 30, 60_000);
      if (!success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Troppi tentativi. Riprova tra poco." });
      }

      // T1.1 (G1): the anon ctx client is blocked by partner-scoped RLS, so token
      // validation goes through the narrow SECURITY DEFINER RPC (migration 017).
      const { data: rows, error } = await ctx.supabase.rpc("checkin_validate_token", {
        p_token: input.token,
      });
      const v = (Array.isArray(rows) ? rows[0] : rows) as
        | {
            checkin_id: string;
            client_id: string;
            partner_id: string;
            client_first_name: string | null;
            due_date: string | null;
            prev_weight_kg: number | null;
            is_valid: boolean;
            invalid_reason: string | null;
          }
        | undefined;

      if (error) {
        console.error("[router/checkin.validateToken] rpc:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore di verifica. Riprova tra poco." });
      }
      if (!v?.is_valid) {
        return { valid: false as const, checkin: null };
      }

      return {
        valid: true as const,
        checkin: {
          id: v.checkin_id,
          status: "pending" as const,
          due_date: v.due_date,
          created_at: null,
          client: { id: v.client_id, full_name: v.client_first_name },
        },
      };
    }),

  /**
   * Submit check-in data (public — authenticated via token).
   */
  submitCheckin: publicProcedure
    .input(checkinSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers);
      const { success } = rateLimit(`submitCheckin:${ip}`, 10, 60_000);
      if (!success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Troppi tentativi. Riprova tra poco." });
      }

      // 1+2. Validate token AND fetch deviation context through the SECURITY
      // DEFINER RPC (T1.1/G1 — the anon client's direct reads are RLS-blocked,
      // which also silently nulled the previous-weight lookup before).
      const { data: vRows, error: vErr } = await ctx.supabase.rpc("checkin_validate_token", {
        p_token: input.token,
      });
      const checkinCtx = (Array.isArray(vRows) ? vRows[0] : vRows) as
        | {
            checkin_id: string;
            client_id: string;
            partner_id: string;
            prev_weight_kg: number | null;
            is_valid: boolean;
            invalid_reason: string | null;
          }
        | undefined;

      if (vErr) {
        console.error("[router/checkin.submitCheckin] validate rpc:", vErr);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel salvataggio. Riprova tra poco." });
      }
      if (!checkinCtx?.is_valid) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            checkinCtx?.invalid_reason === "expired"
              ? "Il link è scaduto. Chiedi al tuo nutrizionista un nuovo check-in."
              : "Check-in non trovato o già completato.",
        });
      }
      const checkin = {
        id: checkinCtx.checkin_id,
        client_id: checkinCtx.client_id,
        partner_id: checkinCtx.partner_id,
      };
      const previousKg = checkinCtx.prev_weight_kg ?? null;

      const deviation = computeWeightDeviation(input.weightKg, previousKg);
      const summary = generateCheckinSummary({
        weightKg: input.weightKg,
        energyLevel: input.energyLevel,
        sleepQuality: input.sleepQuality,
        stressLevel: input.stressLevel,
        adherencePct: input.adherencePct,
        deviationKg: deviation?.deviationKg ?? null,
      });

      // 3. Consume the token atomically via the SECURITY DEFINER RPC — the
      // UPDATE's WHERE (token + pending + unexpired) is the replay/race guard.
      const { data: sRows, error } = await ctx.supabase.rpc("checkin_submit_token", {
        p_token: input.token,
        p_weight_kg: input.weightKg,
        p_energy: input.energyLevel,
        p_sleep: input.sleepQuality,
        p_stress: input.stressLevel,
        p_hunger: input.hungerLevel,
        p_digestive: input.digestiveHealth,
        p_adherence_pct: input.adherencePct,
        p_training_adherence: input.trainingAdherence ?? null,
        p_waist_cm: input.waistCm ?? null,
        p_hip_cm: input.hipCm ?? null,
        p_notes: input.notes ?? null,
        p_photos: input.photos ?? [],
        p_weight_deviation_kg: deviation?.deviationKg ?? null,
        p_weight_flagged: deviation?.flagged ?? false,
        p_ai_summary: summary,
      });
      const submitRes = (Array.isArray(sRows) ? sRows[0] : sRows) as
        | { checkin_id: string; consumed: boolean; invalid_reason: string | null }
        | undefined;

      if (error) {
        console.error("[router/checkin.submitCheckin]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio. Riprova tra poco.",
        });
      }
      if (!submitRes?.consumed) {
        // Lost the race or expired between validate and submit — honest state, no silent success.
        throw new TRPCError({
          code: "CONFLICT",
          message: "Questo check-in risulta già inviato o scaduto.",
        });
      }

      // Dispatch weight alert if deviation exceeds threshold
      if (deviation?.flagged) {
        try {
          // Fetch client name — needed by onWeightAlert to label the notification/task
          const { data: alertClient } = await ctx.supabase
            .from("client")
            .select("full_name")
            .eq("id", checkin.client_id)
            .single();

          await inngest.send({
            name: "checkin/weight-alert",
            data: {
              checkinId: checkin.id,
              clientId: checkin.client_id,
              clientName: alertClient?.full_name ?? "Cliente",
              partnerId: checkin.partner_id,
              weightKg: input.weightKg,
              deviationKg: deviation.deviationKg,
            },
          });
        } catch (err) {
          console.error("[router/checkin.submitCheckin] inngest.send weight-alert failed:", err);
        }
      }

      return { success: true, flagged: deviation?.flagged ?? false };
    }),

  /**
   * List check-ins for the partner with optional filters.
   */
  list: protectedProcedure
    .input(
      z.object({
        clientId: z.string().uuid().optional(),
        status: z.enum(["pending", "completed", "reviewed"]).optional(),
        flaggedOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // NOTE: `token` is intentionally excluded — it authenticates client
      // submission and must not be exposed in bulk list responses.
      // Use checkin.sendCheckin (which returns it once) or portal.getCheckInStatus.
      let query = ctx.supabase
        .from("check_in")
        .select(
          `id, status, weight_kg, weight_deviation_kg, weight_flagged,
           energy_level, sleep_quality, adherence_pct, ai_summary,
           due_date, completed_at, created_at,
           client:client_id (id, full_name)`,
          { count: "exact" }
        )
        .eq("partner_id", ctx.partnerId)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.clientId) query = query.eq("client_id", input.clientId);
      if (input.status) query = query.eq("status", input.status);
      if (input.flaggedOnly) query = query.eq("weight_flagged", true);

      const { data, count, error } = await query;

      if (error) {
        console.error("[router/checkin.list]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return { checkins: data ?? [], total: count ?? 0 };
    }),

  /**
   * #2 dashboard — latest COMPLETED check-in for one client (partner-scoped).
   * Like `list` but returns a single newest-completed row AND `review_notes`
   * (which `list` omits) for the dashboard's feedback card. No migration.
   */
  getLatestCompleted: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("check_in")
        .select(
          `id, status, weight_kg, weight_deviation_kg, weight_flagged,
           energy_level, sleep_quality, adherence_pct, ai_summary, review_notes,
           due_date, completed_at, created_at,
           client:client_id (id, full_name)`
        )
        .eq("partner_id", ctx.partnerId)
        .eq("client_id", input.clientId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[router/checkin.getLatestCompleted]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return { checkin: data ?? null };
    }),

  /**
   * Get a single check-in by ID with full details.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: checkin, error } = await ctx.supabase
        .from("check_in")
        .select(
          `*, client:client_id (id, full_name, email)`
        )
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .single();

      if (error) {
        throwDiscriminated(error, "Check-in non trovato.", "router/checkin.getById");
      }
      if (!checkin) {
        throwDiscriminated(null, "Check-in non trovato.", "router/checkin.getById");
      }

      return checkin;
    }),

  /**
   * Batch review: get all completed (unreviewed) check-ins with summaries.
   */
  batchReview: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("check_in")
        .select(
          `id, weight_kg, weight_deviation_kg, weight_flagged,
           energy_level, sleep_quality, stress_level, adherence_pct,
           ai_summary, completed_at, notes,
           client:client_id (id, full_name)`
        )
        .eq("partner_id", ctx.partnerId)
        .eq("status", "completed")
        .order("weight_flagged", { ascending: false })
        .order("completed_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        console.error("[router/checkin.batchReview]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return data ?? [];
    }),

  /**
   * Mark a check-in as reviewed with optional notes.
   */
  markReviewed: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        reviewNotes: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("check_in")
        .update({
          status: "reviewed",
          reviewed_at: new Date().toISOString(),
          review_notes: input.reviewNotes ?? null,
        })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/checkin.markReviewed]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      return { success: true };
    }),
});
