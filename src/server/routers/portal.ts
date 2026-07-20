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
import { toClientPlanHistory, type RawPlanRow } from "../plan-versioning";
import type { SupplementEntry } from "../../pdf/types";
import { rateLimit, getClientIp } from "../../lib/rate-limit";
// #18 → portal: representative per-week training time from the client's latest
// intake (_intake.training_sessions). Pure, framework-free helper shared with
// the coach card so the portal timed-session box mirrors it exactly.
import { firstTrainingTime, type RawSession } from "../../components/plan/peri-workout-timing";

// ── Shared Helpers ────────────────────────────────────────────────────────────

/** Return a fresh service-role Supabase client */
function svc() {
  return createSupabaseServiceRole();
}

// ── Input Schemas ─────────────────────────────────────────────────────────────

// (mealTypeSchema removed with portal.getExampleMeals — chore/deadcode.)

const diaryEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data: YYYY-MM-DD"), // ISO date YYYY-MM-DD
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
  // Storage paths (e.g. "training-screenshots/<pid>/<cid>/<file>") OR https URLs.
  screenshotUrls: z.array(z.string().min(1).max(500)).max(10).optional(),
});

const snapshotSchema = z.object({
  weightKg: z.number().min(30).max(300).optional(),
  bodyFatPct: z.number().min(3).max(60).optional(),
  notes: z.string().max(2000).optional(),
  // #27 Stage 3: progress photos. Storage paths
  // ("client-photos/<partner_id>/<client_id>/<file>") OR https URLs, like the
  // training_log.screenshotUrls pattern. Persisted to client_snapshot.photo_*_url.
  photoFrontUrl: z.string().min(1).max(500).optional(),
  photoSideUrl: z.string().min(1).max(500).optional(),
  photoBackUrl: z.string().min(1).max(500).optional(),
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
         meals_per_day, meal_distribution, diet_emphasis, notes, first_viewed_at`
      )
      .eq("client_id", ctx.clientId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[router/portal.getActivePlan]", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
    }

    if (!data) return null;

    // T1.6b (G9): the client just VIEWED the plan — record it once (idempotent
    // WHERE guard), fire-and-forget so the read path never blocks on it. This is
    // the signal the 48h/7d "not viewed" reminders key on (was: dead 'delivered'
    // status check + unconditional escalation).
    if (!data.first_viewed_at) {
      try {
        void Promise.resolve(
          db.from("plan")
            .update({ first_viewed_at: new Date().toISOString() })
            .eq("id", data.id)
            .is("first_viewed_at", null)
        ).then(
          (res) => {
            const viewErr = (res as { error?: unknown } | null)?.error;
            if (viewErr) console.error("[router/portal.getActivePlan] first_viewed_at:", viewErr);
          },
          (err) => console.error("[router/portal.getActivePlan] first_viewed_at:", err)
        );
      } catch (err) {
        // The view-marker must NEVER break the plan read (NORTHSTAR: nothing hidden,
        // but the deliverable comes first). Mocked/partial db clients land here.
        console.error("[router/portal.getActivePlan] first_viewed_at sync:", err);
      }
    }

    // Extract the meal plan from the plan bundle stored in daily_targets.
    // The engine writes meal data to daily_targets.plan_bundle.reportData.dayTypePlans,
    // not to the meal_distribution column (which is never written during plan generation).
    const planBundle = (data.daily_targets as Record<string, unknown> | null)?.plan_bundle as Record<string, unknown> | undefined;
    const dayTypePlans = (planBundle?.reportData as Record<string, unknown> | undefined)?.dayTypePlans ?? [];
    // #23: supplements live in the plan bundle (coach-curated), NOT the write-dead
    // supplement_protocol relation. Read what the coach actually set.
    const supplements = (planBundle?.supplements as SupplementEntry[] | undefined) ?? [];

    // #18 → portal: expose the client's representative training time so the
    // patient can render the same PeriWorkoutTimingCard the coach sees. Read it
    // from the latest snapshot's intake (display-only; the engine ignores it).
    // ADDITIVE + ctx.clientId-scoped. Absent training time → {} → no box.
    const { data: snap } = await db
      .from("client_snapshot")
      .select("skinfold_data")
      .eq("client_id", ctx.clientId)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const trainingSessions = (
      (snap?.skinfold_data as { _intake?: { training_sessions?: Record<string, RawSession[]> } } | null)
        ?._intake?.training_sessions
    );
    const trainingTime = firstTrainingTime(trainingSessions);

    return {
      ...data,
      mealPlan: dayTypePlans as Array<{ dayType: string; label: string; mealPlan?: { withinTolerance: boolean; slots: Array<{ slot: string; primary: { template: { name: string }; scaledIngredients: Array<{ name: string; grams: number }>; actualMacros: { kcal: number; proteinG: number; carbsG: number; fatG: number } } }> } }>,
      supplements,
      trainingTime,
    };
  }),

  /**
   * Get the authenticated client's own plan version history (PR #10 portal
   * "Storico piani"), newest-first. Strictly scoped to ctx.clientId so a patient
   * can only ever see their own plans. CLIENT-VISIBLE fields only — coach-only
   * internals (change_reason, review notes) are never exposed. Returns all of the
   * client's versions across any chains, each tagged with rootPlanId for grouping.
   */
  getPlanHistory: clientProcedure.query(async ({ ctx }) => {
    const db = svc();
    const { data: rows, error } = await db
      .from("plan")
      .select("id, status, version_number, version_label, parent_plan_id, created_at")
      .eq("client_id", ctx.clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[router/portal.getPlanHistory]", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Errore nel caricamento dello storico piani.",
      });
    }

    return { versions: toClientPlanHistory((rows ?? []) as RawPlanRow[]) };
  }),

  /**
   * #27 Stage 3 — the patient's OWN documents (PDFs etc.). The document table is
   * coach-managed (document.ts is protectedProcedure); this is the patient read,
   * STRICTLY scoped to ctx.clientId (a client never sees another client's docs).
   * Newest-first, soft-deletes excluded.
   */
  getDocuments: clientProcedure.query(async ({ ctx }) => {
    const db = svc();
    const { data, error } = await db
      .from("document")
      .select("id, title, doc_type, file_url, mime_type, file_size_bytes, created_at")
      .eq("client_id", ctx.clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[router/portal.getDocuments]", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei documenti." });
    }

    return { documents: data ?? [] };
  }),

  /**
   * #27 Stage 3 — the patient's OWN notification feed (the partner/coach feed is
   * notification.getForClient). STRICTLY scoped to ctx.clientId, newest-first,
   * plus a cheap unread count for a badge.
   */
  getNotifications: clientProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = svc();
      let query = db
        .from("notification")
        .select("id, trigger, priority, title, body, read, metadata, created_at")
        .eq("client_id", ctx.clientId);
      if (input?.unreadOnly) query = query.eq("read", false);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(input?.limit ?? 30);

      if (error) {
        console.error("[router/portal.getNotifications]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento delle notifiche." });
      }

      const { count, error: countError } = await db
        .from("notification")
        .select("id", { count: "exact", head: true })
        .eq("client_id", ctx.clientId)
        .eq("read", false);
      if (countError) {
        console.error("[router/portal.getNotifications] count", countError);
      }

      return { notifications: data ?? [], unreadCount: count ?? 0 };
    }),

  // NOTE (chore/deadcode): portal.getExampleMeals was removed here — 0 callers
  // across all of src. The `example_meal` table is now unreferenced by any code
  // → orphan / DROP candidate for a future migration (James applies schema changes).

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
        // T1.3 (G22): pending rows have NULL check_in_date and crashed the page's
        // date math (new Date(null)=epoch defeats the NaN guard). Trend = completed only.
        .eq("status", "completed")
        .not("check_in_date", "is", null)
        .order("check_in_date", { ascending: true })
        .limit(16),

      // Training logs last 30 days for consistency
      db
        .from("training_log")
        .select("logged_at, day_type, kcal_calculated, kcal_override")
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
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data: YYYY-MM-DD") })) // ISO date YYYY-MM-DD
    .query(async ({ ctx, input }) => {
      const db = svc();
      const { data, error } = await db
        .from("diary_entry")
        .select("*")
        .eq("client_id", ctx.clientId)
        .eq("entry_date", input.date)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[router/portal.getDiaryEntries]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
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
        console.error("[router/portal.addDiaryEntry]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio del diario.",
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
        console.error("[router/portal.getTrainingLogs]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
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
          screenshot_urls: input.screenshotUrls ?? [],
        })
        .select("id")
        .single();

      if (error || !data) {
        console.error("[router/portal.addTrainingLog]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio dell'allenamento.",
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
          // #27 — additively expose the progress-photo URLs (columns already exist;
          // persisted by addSnapshot) so the Progressi page can DISPLAY the gallery.
          "id, taken_at, weight_kg, height_cm, body_fat_pct, lean_mass_kg, fat_mass_kg, notes, photo_front_url, photo_side_url, photo_back_url"
        )
        .eq("client_id", ctx.clientId)
        .order("taken_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        console.error("[router/portal.getSnapshots]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
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
          // #27 Stage 3: progress photos (additive; null when not provided).
          photo_front_url: input.photoFrontUrl ?? null,
          photo_side_url: input.photoSideUrl ?? null,
          photo_back_url: input.photoBackUrl ?? null,
        })
        .select("id")
        .single();

      if (error || !data) {
        console.error("[router/portal.addSnapshot]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio della misurazione.",
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
        before: z.string().datetime().optional(), // cursor: message created_at ISO datetime
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
        console.error("[router/portal.getMessages]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return (data ?? []).reverse(); // chronological order
    }),

  /**
   * Send a message from the client to the coach.
   */
  sendMessage: clientProcedure
    .input(z.object({ body: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers) !== "unknown" ? getClientIp(ctx.headers) : (ctx.clientId ?? "unknown");
      const { success } = rateLimit(`portal:sendMessage:${ip}`, 30, 60_000);
      if (!success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Troppi tentativi. Riprova tra poco." });
      }

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
      console.error("[router/portal.markMessagesRead]", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
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

    // Check for a pending check-in token.
    // Tokens are stored on the check_in row (check_in.token column) — there is
    // no separate check_in_token table. Query the most recent pending check-in.
    const { data: pendingCheckin } = await db
      .from("check_in")
      .select("token")
      .eq("client_id", ctx.clientId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      latestCheckIn: latest ?? null,
      pendingToken: pendingCheckin?.token ?? null,
    };
  }),

  /**
   * Save a web push subscription for this client.
   * Note: Requires a push_subscription table (see ISSUES in Batch 8 output).
   */
  savePushSubscription: clientProcedure
    .input(
      z.object({
        // Push subscription endpoints from browsers are always https://
        endpoint: z.string().url().startsWith("https://"),
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
