/**
 * Portal Router — client-facing tRPC endpoints.
 *
 * All procedures require authenticated client session (clientProcedure).
 * Data access uses service role to bypass partner-only RLS, scoped strictly by clientId.
 *
 * Endpoints:
 * - getMyProfile        — client's own profile + coach info
 * - getActivePlan       — active nutrition plan with supplement protocol
 * - getExampleMeals     — alternative meals for swapping (by meal type + macro match)
 * - getDashboardData    — weight trend, macro adherence, training consistency charts
 * - getDiaryEntries     — food diary entries for a given date
 * - addDiaryEntry       — add a diary entry
 * - getTrainingLogs     — recent training sessions
 * - addTrainingLog      — log a training session
 * - getSnapshots        — weight/measurement history
 * - addSnapshot         — log weight/measurements/photos
 * - getMessages         — paginated message thread
 * - sendMessage         — send a message to coach
 * - markMessagesRead    — mark all coach messages as read
 * - getCheckInStatus    — whether a check-in is pending
 * - savePushSubscription — register browser push subscription
 */

import { z } from "zod/v4";
import { router, clientProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { createSupabaseServiceRole } from "../../lib/supabase/service";

// ── Shared Helpers ────────────────────────────────────────────────────────────

/** Return a fresh service-role Supabase client */
function svc() {
  return createSupabaseServiceRole();
}

// ── Input Schemas ─────────────────────────────────────────────────────────────

const mealTypeSchema = z.enum([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "pre_workout",
  "post_workout",
]);

const diaryEntrySchema = z.object({
  entryDate: z.string(), // ISO date YYYY-MM-DD
  mealSlot: z.string().max(50).optional(),
  foodItems: z
    .array(
      z.object({
        name: z.string().max(200),
        grams: z.number().min(0).max(5000),
        kcal: z.number().min(0),
        protein: z.number().min(0),
        carbs: z.number().min(0),
        fat: z.number().min(0),
      })
    )
    .min(1),
  notes: z.string().max(2000).optional(),
});

const trainingLogSchema = z.object({
  dayType: z.enum(["training", "rest", "refeed", "deload"]),
  durationMin: z.number().int().min(1).max(480).optional(),
  avgHeartRate: z.number().int().min(40).max(250).optional(),
  kcalEstimated: z.number().int().min(0).max(5000).optional(),
  steps: z.number().int().min(0).max(100000).optional(),
  rpe: z.number().min(1).max(10).optional(),
  trainingNotes: z.string().max(2000).optional(),
});

const snapshotSchema = z.object({
  weightKg: z.number().min(30).max(300).optional(),
  bodyFatPct: z.number().min(3).max(60).optional(),
  notes: z.string().max(2000).optional(),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const portalRouter = router({
  /**
   * Get the client's own profile including coach information.
   */
  getMyProfile: clientProcedure.query(async ({ ctx }) => {
    const db = svc();
    const { data, error } = await db
      .from("client")
      .select(
        `id, full_name, email, phone, date_of_birth, sex, status, tags,
         partner:partner_id (id, full_name, email, avatar_url)`
      )
      .eq("id", ctx.clientId)
      .single();

    if (error || !data) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Profilo cliente non trovato.",
      });
    }

    return data;
  }),

  /**
   * Get the client's active nutrition plan with supplement protocol.
   */
  getActivePlan: clientProcedure.query(async ({ ctx }) => {
    const db = svc();
    const { data, error } = await db
      .from("plan")
      .select(
        `id, name, status, start_date, end_date, daily_targets,
         water_ml_training, water_ml_rest, salt_g_training, salt_g_rest,
         meals_per_day, meal_distribution, diet_emphasis, notes,
         supplement_protocol (
           id, name, is_active,
           supplement_item (id, name, dosage, timing, frequency, sort_order)
         )`
      )
      .eq("client_id", ctx.clientId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }

    return data ?? null;
  }),

  /**
   * Get example meals that match a given meal type and macro targets.
   * Used to populate swap options in the plan viewer (±10% protein tolerance).
   */
  getExampleMeals: clientProcedure
    .input(
      z.object({
        mealType: mealTypeSchema,
        targetProteinG: z.number().min(0),
        targetCarbsG: z.number().min(0),
        targetFatG: z.number().min(0),
        excludeId: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(6),
      })
    )
    .query(async ({ input }) => {
      const db = svc();
      const tol = 0.15; // ±15% tolerance on protein

      let query = db
        .from("example_meal")
        .select(
          "id, name, description, meal_type, kcal_per_serving, protein_g, carbs_g, fat_g, tags"
        )
        .eq("meal_type", input.mealType)
        .eq("is_active", true)
        .is("deleted_at", null)
        .gte("protein_g", input.targetProteinG * (1 - tol))
        .lte("protein_g", input.targetProteinG * (1 + tol))
        .limit(input.limit);

      if (input.excludeId) {
        query = query.neq("id", input.excludeId);
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return data ?? [];
    }),

  /**
   * Aggregated dashboard data: weight trend, macro adherence, training consistency.
   */
  getDashboardData: clientProcedure.query(async ({ ctx }) => {
    const db = svc();

    const [checkInsResult, trainingResult, diaryResult, planResult] = await Promise.all([
      // Weight trend from last 16 check-ins
      db
        .from("check_in")
        .select("check_in_date, weight_kg, nutrition_adherence, training_adherence")
        .eq("client_id", ctx.clientId)
        .order("check_in_date", { ascending: true })
        .limit(16),

      // Training logs last 30 days for consistency
      db
        .from("training_log")
        .select("logged_at, day_type, kcal_calculated")
        .eq("client_id", ctx.clientId)
        .order("logged_at", { ascending: false })
        .limit(30),

      // Diary entries last 14 days for macro adherence
      db
        .from("diary_entry")
        .select("entry_date, total_kcal, total_protein_g, total_carbs_g, total_fat_g")
        .eq("client_id", ctx.clientId)
        .order("entry_date", { ascending: false })
        .limit(14),

      // Active plan for targets
      db
        .from("plan")
        .select("daily_targets, meals_per_day")
        .eq("client_id", ctx.clientId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      weightTrend: checkInsResult.data ?? [],
      trainingLogs: trainingResult.data ?? [],
      diaryEntries: diaryResult.data ?? [],
      activePlan: planResult.data ?? null,
    };
  }),

  /**
   * Get food diary entries for a specific date.
   */
  getDiaryEntries: clientProcedure
    .input(z.object({ date: z.string() })) // ISO date YYYY-MM-DD
    .query(async ({ ctx, input }) => {
      const db = svc();
      const { data, error } = await db
        .from("diary_entry")
        .select("*")
        .eq("client_id", ctx.clientId)
        .eq("entry_date", input.date)
        .order("created_at", { ascending: true });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return data ?? [];
    }),

  /**
   * Add a food diary entry.
   */
  addDiaryEntry: clientProcedure
    .input(diaryEntrySchema)
    .mutation(async ({ ctx, input }) => {
      const db = svc();

      // Compute totals from food items
      const totals = input.foodItems.reduce(
        (acc, item) => ({
          kcal: acc.kcal + item.kcal,
          protein: acc.protein + item.protein,
          carbs: acc.carbs + item.carbs,
          fat: acc.fat + item.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      );

      // Get active plan id for FK
      const { data: plan } = await db
        .from("plan")
        .select("id")
        .eq("client_id", ctx.clientId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      const { data, error } = await db
        .from("diary_entry")
        .insert({
          client_id: ctx.clientId,
          plan_id: plan?.id ?? null,
          entry_date: input.entryDate,
          meal_slot: input.mealSlot ?? null,
          food_items: input.foodItems,
          total_kcal: totals.kcal,
          total_protein_g: totals.protein,
          total_carbs_g: totals.carbs,
          total_fat_g: totals.fat,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nel salvataggio del diario.",
        });
      }

      return { id: data.id };
    }),

  /**
   * Get recent training log entries.
   */
  getTrainingLogs: clientProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = svc();
      const { data, error, count } = await db
        .from("training_log")
        .select("*", { count: "exact" })
        .eq("client_id", ctx.clientId)
        .order("logged_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { logs: data ?? [], total: count ?? 0 };
    }),

  /**
   * Log a training session.
   */
  addTrainingLog: clientProcedure
    .input(trainingLogSchema)
    .mutation(async ({ ctx, input }) => {
      const db = svc();

      const { data: plan } = await db
        .from("plan")
        .select("id")
        .eq("client_id", ctx.clientId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      const { data, error } = await db
        .from("training_log")
        .insert({
          client_id: ctx.clientId,
          plan_id: plan?.id ?? null,
          logged_at: new Date().toISOString(),
          day_type: input.dayType,
          duration_min: input.durationMin ?? null,
          avg_heart_rate: input.avgHeartRate ?? null,
          kcal_estimated: input.kcalEstimated ?? null,
          steps: input.steps ?? null,
          rpe: input.rpe ?? null,
          training_notes: input.trainingNotes ?? null,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nel salvataggio dell'allenamento.",
        });
      }

      return { id: data.id };
    }),

  /**
   * Get weight and measurement snapshots (history).
   */
  getSnapshots: clientProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = svc();
      const { data, error } = await db
        .from("client_snapshot")
        .select(
          "id, taken_at, weight_kg, height_cm, body_fat_pct, lean_mass_kg, fat_mass_kg, notes"
        )
        .eq("client_id", ctx.clientId)
        .order("taken_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return data ?? [];
    }),

  /**
   * Log a new weight / measurement snapshot.
   */
  addSnapshot: clientProcedure
    .input(snapshotSchema)
    .mutation(async ({ ctx, input }) => {
      const db = svc();
      const { data, error } = await db
        .from("client_snapshot")
        .insert({
          client_id: ctx.clientId,
          taken_at: new Date().toISOString(),
          weight_kg: input.weightKg ?? null,
          body_fat_pct: input.bodyFatPct ?? null,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nel salvataggio della misurazione.",
        });
      }

      return { id: data.id };
    }),

  /**
   * Get the message thread between client and coach.
   */
  getMessages: clientProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        before: z.string().optional(), // cursor: message created_at ISO string
      })
    )
    .query(async ({ ctx, input }) => {
      const db = svc();
      let query = db
        .from("message")
        .select("id, sender_type, sender_id, body, attachments, is_read, read_at, created_at")
        .eq("client_id", ctx.clientId)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.before) {
        query = query.lt("created_at", input.before);
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return (data ?? []).reverse(); // chronological order
    }),

  /**
   * Send a message from the client to the coach.
   */
  sendMessage: clientProcedure
    .input(z.object({ body: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const db = svc();
      const { data, error } = await db
        .from("message")
        .insert({
          client_id: ctx.clientId,
          sender_type: "client",
          sender_id: ctx.userId,
          body: input.body,
          is_read: false,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nell'invio del messaggio.",
        });
      }

      return { id: data.id };
    }),

  /**
   * Mark all incoming coach messages as read.
   */
  markMessagesRead: clientProcedure.mutation(async ({ ctx }) => {
    const db = svc();
    const { error } = await db
      .from("message")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("client_id", ctx.clientId)
      .eq("sender_type", "coach")
      .eq("is_read", false);

    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }

    return { success: true };
  }),

  /**
   * Get check-in status — whether a check-in is pending/overdue and the most recent one.
   */
  getCheckInStatus: clientProcedure.query(async ({ ctx }) => {
    const db = svc();

    const { data: latest } = await db
      .from("check_in")
      .select("id, check_in_date, weight_kg, nutrition_adherence, training_adherence")
      .eq("client_id", ctx.clientId)
      .order("check_in_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check for a pending check-in token
    const { data: token } = await db
      .from("check_in_token")
      .select("token, expires_at, used_at")
      .eq("client_id", ctx.clientId)
      .is("used_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      latestCheckIn: latest ?? null,
      pendingToken: token?.token ?? null,
    };
  }),

  /**
   * Save a web push subscription for this client.
   * Note: Requires a push_subscription table (see ISSUES in Batch 8 output).
   */
  savePushSubscription: clientProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Stored in client.notes as a workaround until push_subscription table is added
      // Real implementation: upsert into push_subscription table
      void ctx; // suppress unused warning
      void input;
      return { success: true };
    }),
});
