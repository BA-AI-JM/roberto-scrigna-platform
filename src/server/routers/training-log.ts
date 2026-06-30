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
import { getAnthropic } from "../../lib/anthropic/client";
import { createSupabaseServiceRole } from "../../lib/supabase/service";
import { runSCP } from "../../engine/sport-correction/index";
import { findSportEntry } from "../../engine/sport-taxonomy";

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
  // Free-form modality string. New entries use the canonical Appendix D
  // Italian display names (e.g. "Pesi — Ipertrofia", "BJJ — Sparring",
  // "Corsa — Costante"). Legacy short codes ('strength', 'cardio', …) still
  // accepted for backward compatibility with rows written before
  // migration 004.
  sessionType: z.string().min(1).max(200),
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

// ── OCR via Claude Vision ───────────────────────────────────────────────────

/**
 * JSON Schema for structured extraction. Kept generic enough to work across
 * the fitness apps Roberto's clients use (Strong, Hevy, Apple Fitness, Garmin
 * Connect, Polar Flow, Whoop, Apple Watch summary, etc.) — Claude generalizes
 * across app layouts so we don't have to tune per-app prompts.
 *
 * All scalar fields are nullable so the model can return null when the
 * screenshot doesn't show a value (rather than fabricating).
 */
const OCR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "app_detected",
    "session_type_guess",
    "duration_min",
    "avg_heart_rate",
    "max_heart_rate",
    "kcal",
    "hr_zone_minutes",
    "exercises",
    "confidence",
    "notes",
  ],
  properties: {
    app_detected: {
      type: ["string", "null"],
      description:
        "Which fitness app the screenshot is from (e.g. 'Strong', 'Hevy', 'Garmin Connect', 'Apple Fitness', 'Polar Flow', 'Whoop', 'Apple Watch'). Null if not recognisable.",
    },
    session_type_guess: {
      type: ["string", "null"],
      description:
        "Italian-canonical session modality if it can be inferred (e.g. 'Pesi — Ipertrofia', 'Corsa — Costante', 'BJJ — Classe', 'CrossFit / WOD'). Null otherwise.",
    },
    duration_min: { type: ["integer", "null"] },
    avg_heart_rate: { type: ["integer", "null"] },
    max_heart_rate: { type: ["integer", "null"] },
    kcal: { type: ["integer", "null"] },
    hr_zone_minutes: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["z1", "z2", "z3", "z4", "z5"],
      properties: {
        z1: { type: "integer" },
        z2: { type: "integer" },
        z3: { type: "integer" },
        z4: { type: "integer" },
        z5: { type: "integer" },
      },
      description:
        "Minutes spent in each HR zone, when the screenshot shows a zone breakdown. The sum should roughly equal duration_min.",
    },
    exercises: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "sets", "reps", "weight_kg", "rpe", "notes"],
        properties: {
          name: { type: "string" },
          sets: { type: ["integer", "null"] },
          reps: {
            type: ["string", "null"],
            description:
              "Reps per set as the screenshot shows them (e.g. '10' or '8, 8, 6').",
          },
          weight_kg: {
            type: ["number", "null"],
            description: "Weight per set in kilograms. Convert from lbs if needed.",
          },
          rpe: { type: ["number", "null"] },
          notes: { type: ["string", "null"] },
        },
      },
    },
    confidence: {
      type: "number",
      description:
        "Self-assessed confidence in the overall extraction, 0 (guessing) to 1 (everything clearly visible).",
    },
    notes: {
      type: "string",
      description:
        "Anything else worth surfacing to the coach (e.g. 'screenshot is partially cropped', 'this looks like a meal photo, not a workout', 'weight units were in lbs').",
    },
  },
} as const;

interface OcrPayload {
  app_detected: string | null;
  session_type_guess: string | null;
  duration_min: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  kcal: number | null;
  hr_zone_minutes: { z1: number; z2: number; z3: number; z4: number; z5: number } | null;
  exercises: Array<{
    name: string;
    sets: number | null;
    reps: string | null;
    weight_kg: number | null;
    rpe: number | null;
    notes: string | null;
  }>;
  confidence: number;
  notes: string;
}

const OCR_PROMPT = `You are extracting workout data from a fitness-app screenshot for an Italian sports nutritionist's platform. The screenshot may be in Italian, English, or mixed.

Extract every visible workout field — total duration, heart rate (avg, max, per-zone minutes), kcal, modality, and any per-exercise data (name, sets, reps, weight, RPE, rest, notes). If a field isn't shown, return null — don't guess.

For session_type_guess, infer the closest Italian-canonical label (examples: 'Pesi — Forza', 'Pesi — Ipertrofia', 'Pesi — Circuito', 'Corsa — Facile / Recupero', 'Corsa — Costante', 'Corsa — Intervalli / Tempo', 'Ciclismo', 'Vogatore', 'Nuoto', 'CrossFit / WOD', 'HIIT / Intervalli', 'BJJ — Classe', 'Boxe — Classe', 'MMA — Classe (mista)', 'Calcio — Allenamento', 'Tennis — Singolo', 'Padel', 'Altro'). Pick 'Altro' if nothing fits well; null only if you genuinely can't tell.

Convert weights from lbs to kg (× 0.453592) and round to the nearest 0.5 kg. Preserve the original reps format ("10" or "8, 8, 6").

If the image clearly isn't a workout (e.g. it's a meal photo, an app menu, the device home screen), return empty exercises with confidence 0 and explain what you see in notes.

Calibrate confidence honestly:
- 0.9–1.0  every field clearly readable
- 0.6–0.9  most fields readable, some unclear or missing
- 0.3–0.6  significant uncertainty
- 0.0–0.3  guessing, or the image isn't a workout`;

interface ExtractedSessionData {
  durationMin?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  kcalEstimated?: number;
  hrZoneMinutes?: { z1: number; z2: number; z3: number; z4: number; z5: number };
  appDetected?: string;
  sessionTypeGuess?: string;
}

interface OcrResult {
  exercises: z.infer<typeof exerciseEntrySchema>[];
  confidence: number;
  rawText: string;
  sessionData: ExtractedSessionData;
}

const EMPTY_OCR: OcrResult = {
  exercises: [],
  confidence: 0,
  rawText: "",
  sessionData: {},
};

/**
 * If `pathOrUrl` is already an https:// URL, returns it unchanged.
 * Otherwise treats it as a Supabase Storage path in the `client-media` bucket
 * and generates a short-lived signed read URL for Claude to fetch.
 */
async function resolveScreenshotUrl(pathOrUrl: string): Promise<string | null> {
  if (/^https:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const admin = createSupabaseServiceRole();
  const { data, error } = await admin.storage
    .from("client-media")
    .createSignedUrl(pathOrUrl, 300);
  if (error || !data?.signedUrl) {
    console.error("[training-log.ocr] signed URL error:", error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Extract structured workout data from a fitness-app screenshot via Claude
 * Opus 4.7 vision. Generalises across apps — no per-app prompt tuning needed.
 * Returns an empty result on any failure rather than throwing, so a flaky
 * vision call never blocks creating the training log.
 */
async function extractExercisesFromScreenshot(imageUrl: string): Promise<OcrResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[training-log.ocr] ANTHROPIC_API_KEY missing — skipping vision call");
    return EMPTY_OCR;
  }

  try {
    const response = await getAnthropic().messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4000,
      output_config: {
        effort: "medium",
        format: {
          type: "json_schema",
          schema: OCR_JSON_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: OCR_PROMPT },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return EMPTY_OCR;
    const rawText = textBlock.text;

    let payload: OcrPayload;
    try {
      payload = JSON.parse(rawText) as OcrPayload;
    } catch (err) {
      console.error("[training-log.ocr] JSON parse failed:", err, rawText.slice(0, 200));
      return { ...EMPTY_OCR, rawText };
    }

    // Map the API exercise shape onto our internal schema (snake → camel,
    // null → undefined so Zod's optional() is happy).
    const exercises: z.infer<typeof exerciseEntrySchema>[] = payload.exercises
      .map((e) => ({
        name: e.name,
        sets: e.sets ?? undefined,
        reps: e.reps ?? undefined,
        weightKg: e.weight_kg ?? undefined,
        rpe: e.rpe ?? undefined,
        notes: e.notes ?? undefined,
      }))
      .filter((e) => e.name && e.name.trim().length > 0);

    const sessionData: ExtractedSessionData = {
      durationMin: payload.duration_min ?? undefined,
      avgHeartRate: payload.avg_heart_rate ?? undefined,
      maxHeartRate: payload.max_heart_rate ?? undefined,
      kcalEstimated: payload.kcal ?? undefined,
      hrZoneMinutes: payload.hr_zone_minutes ?? undefined,
      appDetected: payload.app_detected ?? undefined,
      sessionTypeGuess: payload.session_type_guess ?? undefined,
    };

    return {
      exercises,
      confidence: payload.confidence,
      rawText: payload.notes ?? "",
      sessionData,
    };
  } catch (err) {
    console.error("[training-log.ocr] vision call failed:", err);
    return EMPTY_OCR;
  }
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

      // Process screenshots for OCR if provided and no manual exercises given.
      // The vision call resolves the storage path to a short-lived signed URL
      // before sending to Claude.
      let exercises = input.exercises ?? [];
      let ocrData: { rawText: string; confidence: number } | null = null;
      let extractedDuration: number | null = null;
      let extractedAvgHr: number | null = null;
      let extractedKcal: number | null = null;
      let scpKcal: number | null = null;
      let scpMethod: string | null = null;

      if (input.screenshotUrls?.length && !input.exercises?.length) {
        const httpsUrl = await resolveScreenshotUrl(input.screenshotUrls[0]!);
        if (httpsUrl) {
          const result = await extractExercisesFromScreenshot(httpsUrl);
          exercises = result.exercises;
          ocrData = { rawText: result.rawText, confidence: result.confidence };
          // Fall back to OCR-extracted values when the form didn't include them.
          extractedDuration = result.sessionData.durationMin ?? null;
          extractedAvgHr = result.sessionData.avgHeartRate ?? null;
          extractedKcal = result.sessionData.kcalEstimated ?? null;

          // SCP path: if OCR returned HR-zone minutes AND a modality we can
          // resolve to an SCP sport entry, derive a sport-corrected exercise
          // EE. Falls back silently to the OCR kcal_estimated on any error.
          if (result.sessionData.hrZoneMinutes && result.sessionData.sessionTypeGuess) {
            const entry = findSportEntry(result.sessionData.sessionTypeGuess);
            if (entry) {
              try {
                const { data: snap } = await ctx.supabase
                  .from("client_snapshot")
                  .select("weight_kg, age_years")
                  .eq("client_id", input.clientId)
                  .order("taken_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                const { data: clientRow } = await ctx.supabase
                  .from("client")
                  .select("sex")
                  .eq("id", input.clientId)
                  .single();

                const weightKg = Number(snap?.weight_kg);
                const ageYears = Number(snap?.age_years);
                const sex = clientRow?.sex as "male" | "female" | undefined;
                if (
                  Number.isFinite(weightKg) && weightKg > 0 &&
                  Number.isFinite(ageYears) && ageYears > 0 &&
                  (sex === "male" || sex === "female")
                ) {
                  const z = result.sessionData.hrZoneMinutes;
                  const zoneTotal = z.z1 + z.z2 + z.z3 + z.z4 + z.z5;
                  const durationMin = extractedDuration ?? zoneTotal;
                  if (durationMin > 0 && zoneTotal > 0) {
                    const scp = runSCP({
                      hrZoneData: {
                        // SCP expects [belowZ1, Z1, Z2, Z3, Z4, Z5]
                        minutesPerZone: [0, z.z1, z.z2, z.z3, z.z4, z.z5],
                        avgHeartRate: extractedAvgHr ?? 0,
                        totalRecordedMin: durationMin,
                      },
                      categoryId: entry.categoryId,
                      sessionType: entry.sessionType,
                      durationMin,
                      weightKg,
                      ageYears,
                      sex,
                      ...(extractedKcal != null ? { deviceKcal: extractedKcal } : {}),
                      ...(extractedAvgHr != null ? { avgHeartRate: extractedAvgHr } : {}),
                    });
                    if (scp) {
                      scpKcal = scp.exerciseKcal;
                      scpMethod = "sport_correction_protocol";
                    }
                  }
                }
              } catch (err) {
                console.error("[trainingLog.create] SCP failed:", err);
              }
            }
          }
        }
      }

      const { data, error } = await ctx.supabase
        .from("training_log")
        .insert({
          client_id: input.clientId,
          partner_id: ctx.partnerId,
          session_date: input.sessionDate,
          session_type: input.sessionType,
          duration_min: input.durationMinutes ?? extractedDuration,
          avg_heart_rate: extractedAvgHr,
          kcal_estimated: extractedKcal,
          kcal_calculated: scpKcal,
          exercise_method: scpMethod,
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

      return {
        id: data.id,
        ocrProcessed: ocrData !== null,
        scpApplied: scpKcal != null,
        scpKcal,
      };
    }),

  /**
   * List training logs for a client.
   */
  list: protectedProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        sessionType: z.string().min(1).max(200).optional(),
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
           screenshot_urls,
           kcal_estimated, kcal_calculated, kcal_override`,
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
   * #10 (display-only) — set/clear a coach-entered manual per-session expenditure
   * (kcal) for an unusual activity. Partner-scoped: only the session's own coach.
   * Writes ONLY training_log.kcal_override. This is DISPLAY-ONLY — plan generation
   * reads expenditure from the snapshot intake, NEVER from training_log, so this
   * never changes a generated plan. Pass null to clear.
   */
  setSessionKcalOverride: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        kcalOverride: z.number().positive().max(10000).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("training_log")
        .update({ kcal_override: input.kcalOverride })
        .eq("id", input.sessionId)
        .eq("partner_id", ctx.partnerId) // partner-scope guard
        .is("deleted_at", null)
        .select("id, kcal_override, kcal_estimated, kcal_calculated")
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sessione non trovata." });
      }
      return data;
    }),

  /**
   * Process a screenshot through Claude Vision OCR.
   * Accepts either an https:// URL or a Supabase Storage path
   * (e.g. "training-screenshots/<pid>/<cid>/<file>"); paths are resolved to a
   * short-lived signed URL before being sent to Claude.
   */
  processScreenshot: protectedProcedure
    .input(z.object({ imageUrl: z.string().min(1).max(500) }))
    .mutation(async ({ input }) => {
      const httpsUrl = await resolveScreenshotUrl(input.imageUrl);
      if (!httpsUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Impossibile generare il link allo screenshot. Riprova.",
        });
      }
      return await extractExercisesFromScreenshot(httpsUrl);
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
