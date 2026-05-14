/**
 * Training Log Router
 *
 * tRPC procedures for the training log system:
 * - create: log a training session with optional screenshot upload
 * - list: list training logs for a client
 * - getById: single training log detail
 * - processScreenshot: stub for Claude Vision OCR processing
 * - update: update training log entry
 * - delete: soft-delete a training log
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

// ── Schemas ──────────────────────────────────────────────────────────────────

/** Schema for a single exercise entry (manual or OCR-extracted) */
const exerciseEntrySchema = z.object({
  name: z.string().min(1).max(200),
  sets: z.number().int().min(1).max(50).optional(),
  reps: z.string().max(50).optional(), // e.g. "8-10" or "12, 10, 8"
  weightKg: z.number().min(0).max(1000).optional(),
  rpe: z.number().min(1).max(10).optional(),
  restSeconds: z.number().int().min(0).max(600).optional(),
  notes: z.string().max(500).optional(),
});

/** Schema for creating a training log */
const createTrainingLogSchema = z.object({
  clientId: z.string().uuid(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data: YYYY-MM-DD"), // ISO date
  sessionType: z.enum([
    "strength",
    "hypertrophy",
    "cardio",
    "hiit",
    "flexibility",
    "deload",
    "other",
  ]),
  durationMinutes: z.number().int().min(1).max(480).optional(),
  exercises: z.array(exerciseEntrySchema).max(50).optional(),
  // Accept either an https:// URL or a Supabase Storage path
  // (e.g. "training-screenshots/<partner_id>/<client_id>/<file>"). At OCR
  // time the consumer resolves a fresh signed URL from the path.
  screenshotUrls: z.array(z.string().min(1).max(500)).max(10).optional(),
  ocrExtracted: z.boolean().default(false),
  perceivedEffort: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(5000).optional(),
});

/** Schema for updating a training log */
const updateTrainingLogSchema = createTrainingLogSchema.partial().extend({
  id: z.string().uuid(),
});

// ── OCR Processing Stub ─────────────────────────────────────────────────────

/**
 * Extract exercise data from a training screenshot.
 * This is a stub that returns a structured placeholder.
 * In production, this calls Claude Vision API.
 */
function extractExercisesFromScreenshot(_imageUrl: string): {
  exercises: z.infer<typeof exerciseEntrySchema>[];
  confidence: number;
  rawText: string;
} {
  // Stub — real implementation uses Claude Vision API:
  // const response = await anthropic.messages.create({
  //   model: "claude-sonnet-4-20250514",
  //   messages: [{ role: "user", content: [
  //     { type: "image", source: { type: "url", url: imageUrl } },
  //     { type: "text", text: "Extract all exercises..." }
  //   ]}]
  // });
  return {
    exercises: [],
    confidence: 0,
    rawText: "",
  };
}

// ── Router ───────────────────────────────────────────────────────────────────

export const trainingLogRouter = router({
  /**
   * Create a new training log entry.
   */
  create: protectedProcedure
    .input(createTrainingLogSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify client ownership
      const { data: client } = await ctx.supabase
        .from("client")
        .select("id")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      // Process screenshots for OCR if provided
      let exercises = input.exercises ?? [];
      let ocrData: { rawText: string; confidence: number } | null = null;

      if (input.screenshotUrls?.length && !input.exercises?.length) {
        const result = extractExercisesFromScreenshot(input.screenshotUrls[0]!);
        exercises = result.exercises;
        ocrData = { rawText: result.rawText, confidence: result.confidence };
      }

      const { data, error } = await ctx.supabase
        .from("training_log")
        .insert({
          client_id: input.clientId,
          partner_id: ctx.partnerId,
          session_date: input.sessionDate,
          session_type: input.sessionType,
          duration_min: input.durationMinutes ?? null,
          exercises: JSON.stringify(exercises),
          screenshot_urls: input.screenshotUrls ?? [],
          ocr_extracted: input.ocrExtracted || ocrData !== null,
          ocr_raw_text: ocrData?.rawText ?? null,
          ocr_confidence: ocrData?.confidence ?? null,
          perceived_effort: input.perceivedEffort ?? null,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nella creazione del log.",
        });
      }

      return { id: data.id, ocrProcessed: ocrData !== null };
    }),

  /**
   * List training logs for a client.
   */
  list: protectedProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        sessionType: z
          .enum(["strength", "hypertrophy", "cardio", "hiit", "flexibility", "deload", "other"])
          .optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("training_log")
        .select(
          `id, session_date, session_type, duration_min,
           perceived_effort, ocr_extracted, notes, created_at,
           screenshot_urls`,
          { count: "exact" }
        )
        .eq("client_id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .order("session_date", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.sessionType) query = query.eq("session_type", input.sessionType);

      const { data, count, error } = await query;

      if (error) {
        console.error("[router/trainingLog.list]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return { logs: data ?? [], total: count ?? 0 };
    }),

  /**
   * Get a single training log with full exercise data.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("training_log")
        .select(
          `*, client:client_id (id, full_name)`
        )
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Log non trovato." });
      }

      return {
        ...data,
        exercises: typeof data.exercises === "string"
          ? JSON.parse(data.exercises) as z.infer<typeof exerciseEntrySchema>[]
          : data.exercises ?? [],
      };
    }),

  /**
   * Process a screenshot through OCR (Claude Vision stub).
   */
  processScreenshot: protectedProcedure
    .input(
      z.object({
        // Restrict to https:// — passed to Claude Vision API.
        imageUrl: z.string().url().startsWith("https://"),
      })
    )
    .mutation(async ({ input }) => {
      const result = extractExercisesFromScreenshot(input.imageUrl);
      return result;
    }),

  /**
   * Update a training log entry.
   */
  update: protectedProcedure
    .input(updateTrainingLogSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (fields.sessionDate !== undefined) updates.session_date = fields.sessionDate;
      if (fields.sessionType !== undefined) updates.session_type = fields.sessionType;
      if (fields.durationMinutes !== undefined) updates.duration_min = fields.durationMinutes;
      if (fields.exercises !== undefined) updates.exercises = JSON.stringify(fields.exercises);
      if (fields.screenshotUrls !== undefined) updates.screenshot_urls = fields.screenshotUrls;
      if (fields.perceivedEffort !== undefined) updates.perceived_effort = fields.perceivedEffort;
      if (fields.notes !== undefined) updates.notes = fields.notes;

      const { error } = await ctx.supabase
        .from("training_log")
        .update(updates)
        .eq("id", id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null);

      if (error) {
        console.error("[router/trainingLog.update]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      return { success: true };
    }),

  /**
   * Soft-delete a training log.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("training_log")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/trainingLog.delete]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'eliminazione. Riprova." });
      }

      return { success: true };
    }),
});
