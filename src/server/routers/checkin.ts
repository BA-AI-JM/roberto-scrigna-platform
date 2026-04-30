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
      const { data: client } = await ctx.supabase
        .from("client")
        .select("id, full_name, email")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
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
        })
        .select("id, token")
        .single();

      if (error || !checkin) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nella creazione del check-in.",
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

      const { data: checkin } = await ctx.supabase
        .from("check_in")
        .select(
          `id, status, due_date, created_at,
           client:client_id (id, full_name)`
        )
        .eq("token", input.token)
        .eq("status", "pending")
        .single();

      if (!checkin) {
        return { valid: false as const, checkin: null };
      }

      return { valid: true as const, checkin };
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

      // 1. Validate token
      const { data: checkin } = await ctx.supabase
        .from("check_in")
        .select("id, client_id, partner_id, status")
        .eq("token", input.token)
        .eq("status", "pending")
        .single();

      if (!checkin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Check-in non trovato o già completato.",
        });
      }

      // 2. Get previous weight for deviation calculation
      const { data: previousCheckin } = await ctx.supabase
        .from("check_in")
        .select("weight_kg")
        .eq("client_id", checkin.client_id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      let previousKg = previousCheckin?.weight_kg ?? null;

      // If no previous check-in, try initial snapshot
      if (previousKg === null) {
        const { data: snapshot } = await ctx.supabase
          .from("client_snapshot")
          .select("weight_kg")
          .eq("client_id", checkin.client_id)
          .order("taken_at", { ascending: false })
          .limit(1)
          .single();
        previousKg = snapshot?.weight_kg ?? null;
      }

      const deviation = computeWeightDeviation(input.weightKg, previousKg);
      const summary = generateCheckinSummary({
        weightKg: input.weightKg,
        energyLevel: input.energyLevel,
        sleepQuality: input.sleepQuality,
        stressLevel: input.stressLevel,
        adherencePct: input.adherencePct,
        deviationKg: deviation?.deviationKg ?? null,
      });

      // 3. Update the check-in record
      const { error } = await ctx.supabase
        .from("check_in")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          weight_kg: input.weightKg,
          waist_cm: input.waistCm ?? null,
          hip_cm: input.hipCm ?? null,
          energy_level: input.energyLevel,
          sleep_quality: input.sleepQuality,
          stress_level: input.stressLevel,
          hunger_level: input.hungerLevel,
          digestive_health: input.digestiveHealth,
          adherence_pct: input.adherencePct,
          training_adherence: input.trainingAdherence ?? null,
          notes: input.notes ?? null,
          photos: input.photos ?? [],
          weight_deviation_kg: deviation?.deviationKg ?? null,
          weight_flagged: deviation?.flagged ?? false,
          ai_summary: summary,
        })
        .eq("id", checkin.id);

      if (error) {
        console.error("[router/checkin.submitCheckin]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio. Riprova tra poco.",
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

      if (error || !checkin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Check-in non trovato." });
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
