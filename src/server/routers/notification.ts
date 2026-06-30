/**
 * Notification Router
 *
 * tRPC procedures for the notification engine:
 * - list: all notifications for the partner
 * - markRead: mark notification as read
 * - markAllRead: mark all as read
 * - getUnreadCount: badge count
 * - getSettings: notification preferences
 * - updateSettings: toggle notification triggers
 *
 * 12 notification triggers:
 * 1.  checkin_overdue — Client missed check-in deadline
 * 2.  checkin_completed — Client submitted check-in
 * 3.  weight_deviation — Weight change exceeds threshold
 * 4.  low_adherence — Adherence below 70%
 * 5.  plan_expiring — Plan expires in 7 days
 * 6.  invoice_overdue — Invoice past due date
 * 7.  invoice_paid — Invoice marked as paid
 * 8.  task_due_today — Task due today
 * 9.  task_overdue — Task past due date
 * 10. new_message — Client sent a message
 * 11. training_logged — Client logged a training session
 * 12. milestone_reached — Client hit a goal milestone
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { resolveReminderSettings } from "../reminder-due";

// ── Types ────────────────────────────────────────────────────────────────────

/** All notification trigger types */
const notificationTriggerSchema = z.enum([
  "checkin_overdue",
  "checkin_completed",
  "weight_deviation",
  "low_adherence",
  "plan_expiring",
  "invoice_overdue",
  "invoice_paid",
  "task_due_today",
  "task_overdue",
  "new_message",
  "training_logged",
  "milestone_reached",
  "plan_update_suggested",
  "feedback_requested",
  "body_comp_due",
]);

/** Priority levels for notifications */
const notificationPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

/** Trigger-to-priority mapping (defaults) */
const TRIGGER_PRIORITY: Record<string, z.infer<typeof notificationPrioritySchema>> = {
  checkin_overdue: "high",
  checkin_completed: "low",
  weight_deviation: "high",
  low_adherence: "medium",
  plan_expiring: "medium",
  invoice_overdue: "high",
  invoice_paid: "low",
  task_due_today: "medium",
  task_overdue: "high",
  new_message: "medium",
  training_logged: "low",
  milestone_reached: "low",
  plan_update_suggested: "medium",
  feedback_requested: "medium",
  body_comp_due: "medium",
};

/** Trigger-to-Italian label mapping */
const TRIGGER_LABELS: Record<string, string> = {
  checkin_overdue: "Check-in scaduto",
  checkin_completed: "Check-in completato",
  weight_deviation: "Deviazione peso",
  low_adherence: "Aderenza bassa",
  plan_expiring: "Piano in scadenza",
  invoice_overdue: "Fattura scaduta",
  invoice_paid: "Fattura pagata",
  task_due_today: "Task in scadenza oggi",
  task_overdue: "Task scaduto",
  new_message: "Nuovo messaggio",
  training_logged: "Allenamento registrato",
  milestone_reached: "Obiettivo raggiunto",
  plan_update_suggested: "Aggiornamento piano suggerito",
  feedback_requested: "Feedback richiesto",
  body_comp_due: "Misurazioni da aggiornare",
};

// ── Router ───────────────────────────────────────────────────────────────────

export const notificationRouter = router({
  /**
   * List notifications for the partner.
   */
  list: protectedProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().optional(),
        trigger: notificationTriggerSchema.optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("notification")
        .select(
          `id, trigger, priority, title, body, read, metadata,
           created_at, client:client_id (id, full_name)`,
          { count: "exact" }
        )
        .eq("partner_id", ctx.partnerId)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.unreadOnly) query = query.eq("read", false);
      if (input.trigger) query = query.eq("trigger", input.trigger);

      const { data, count, error } = await query;

      if (error) {
        console.error("[router/notification.list]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return { notifications: data ?? [], total: count ?? 0 };
    }),

  /**
   * #2 dashboard — per-client notification feed. Partner-scoped (a coach only
   * ever sees notifications for their own clients: every row carries partner_id,
   * so the partner_id filter is the tenant boundary) AND filtered to one client,
   * newest-first. Mirrors `list`'s row shape. Reuses the existing notification
   * table + client_id index — no migration.
   */
  getForClient: protectedProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        unreadOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("notification")
        .select(
          `id, trigger, priority, title, body, read, metadata,
           created_at, client:client_id (id, full_name)`
        )
        .eq("partner_id", ctx.partnerId)
        .eq("client_id", input.clientId);

      if (input.unreadOnly) query = query.eq("read", false);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        console.error("[router/notification.getForClient]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return { notifications: data ?? [] };
    }),

  /**
   * Get unread notification count (for badge).
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { count, error } = await ctx.supabase
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", ctx.partnerId)
      .eq("read", false);

    if (error) {
      console.error("[router/notification.getUnreadCount]", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
    }

    return { count: count ?? 0 };
  }),

  /**
   * Mark a single notification as read.
   */
  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("notification")
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/notification.markRead]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      return { success: true };
    }),

  /**
   * Mark all notifications as read.
   */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const { error } = await ctx.supabase
      .from("notification")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("partner_id", ctx.partnerId)
      .eq("read", false);

    if (error) {
      console.error("[router/notification.markAllRead]", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
    }

    return { success: true };
  }),

  /**
   * Get notification settings for the partner.
   */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("notification_settings")
      .select("*")
      .eq("partner_id", ctx.partnerId)
      .single();

    // Return defaults if no settings exist
    const triggers = notificationTriggerSchema.options;
    const defaults = Object.fromEntries(
      triggers.map((t) => [t, { enabled: true, email: true, inApp: true }])
    );

    return {
      triggers: data?.triggers ?? defaults,
      labels: TRIGGER_LABELS,
      priorities: TRIGGER_PRIORITY,
    };
  }),

  /**
   * Update notification settings.
   */
  updateSettings: protectedProcedure
    .input(
      z.object({
        triggers: z.record(
          z.string(),
          z.object({
            enabled: z.boolean(),
            email: z.boolean(),
            inApp: z.boolean(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("notification_settings")
        .upsert({
          partner_id: ctx.partnerId,
          triggers: input.triggers,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error("[router/notification.updateSettings]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      return { success: true };
    }),

  /**
   * Build #07 — per-client reminder cadence. Get the coach's reminder settings
   * for one of their clients; returns sensible DEFAULTS when unset (check-in
   * every 21 days = today's behaviour; body-comp 0 = off; enabled).
   * Contract: { checkInEveryDays, bodyCompEveryDays, enabled }.
   */
  getReminderSettings: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Partner-scope: the client must belong to this partner.
      const { data: client } = await ctx.supabase
        .from("client")
        .select("id")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      const { data: row } = await ctx.supabase
        .from("client_reminder_settings")
        .select("check_in_every_days, body_comp_every_days, reminders_enabled")
        .eq("client_id", input.clientId)
        .maybeSingle();

      const s = resolveReminderSettings(row);
      return {
        checkInEveryDays: s.checkInEveryDays,
        bodyCompEveryDays: s.bodyCompEveryDays,
        enabled: s.enabled,
      };
    }),

  /**
   * Build #07 — update a client's reminder cadence. Partner-scoped; ranges
   * validated (check-in 1–90; body-comp 0–90 where 0 = off). Upserts one row
   * per client. Cannot set another partner's client.
   */
  updateReminderSettings: protectedProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        checkInEveryDays: z.number().int().min(1).max(90),
        bodyCompEveryDays: z.number().int().min(0).max(90), // 0 = off
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: client } = await ctx.supabase
        .from("client")
        .select("id")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      const { error } = await ctx.supabase
        .from("client_reminder_settings")
        .upsert(
          {
            client_id: input.clientId,
            check_in_every_days: input.checkInEveryDays,
            body_comp_every_days: input.bodyCompEveryDays,
            reminders_enabled: input.enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" }
        );
      if (error) {
        console.error("[router/notification.updateReminderSettings]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      return {
        success: true,
        checkInEveryDays: input.checkInEveryDays,
        bodyCompEveryDays: input.bodyCompEveryDays,
        enabled: input.enabled,
      };
    }),

  /**
   * Create a notification (internal — called by other services).
   */
  create: protectedProcedure
    .input(
      z.object({
        trigger: notificationTriggerSchema,
        clientId: z.string().uuid().optional(),
        title: z.string().max(200),
        body: z.string().max(2000),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const priority = TRIGGER_PRIORITY[input.trigger] ?? "medium";

      const { data, error } = await ctx.supabase
        .from("notification")
        .insert({
          partner_id: ctx.partnerId,
          client_id: input.clientId ?? null,
          trigger: input.trigger,
          priority,
          title: input.title,
          body: input.body,
          metadata: input.metadata ?? {},
          read: false,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nella creazione della notifica.",
        });
      }

      return { id: data.id };
    }),
});
