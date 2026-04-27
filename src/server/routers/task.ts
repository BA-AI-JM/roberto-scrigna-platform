/**
 * Task Router
 *
 * tRPC procedures for task management:
 * - list: tasks for the partner (with optional client filter)
 * - create: new task
 * - update: edit task fields
 * - updateStatus: change task status
 * - delete: soft-delete
 * - getUpcoming: tasks due in the next N days
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

// ── Schemas ──────────────────────────────────────────────────────────────────

const taskStatusSchema = z.enum(["todo", "in_progress", "done", "cancelled"]);
const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

/** Schema for creating a new task */
const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.default("todo"),
  priority: taskPrioritySchema.default("medium"),
  dueDate: z.string().optional(), // ISO date string
  clientId: z.string().uuid().optional(),
});

/** Schema for updating a task */
const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string().uuid(),
});

// ── Router ───────────────────────────────────────────────────────────────────

/** Task management tRPC router */
export const taskRouter = router({
  /**
   * List tasks for the partner with optional filters.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: taskStatusSchema.optional(),
        priority: taskPrioritySchema.optional(),
        clientId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("task")
        .select(
          `id, title, description, status, priority, due_date,
           completed_at, created_at, updated_at, client_id,
           client:client_id (id, full_name)`
        )
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("priority", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.status) query = query.eq("status", input.status);
      if (input.priority) query = query.eq("priority", input.priority);
      if (input.clientId) query = query.eq("client_id", input.clientId);

      const { data, error } = await query;

      if (error) {
        console.error("[router/task.list]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return data ?? [];
    }),

  /**
   * Get tasks due within the next N days.
   */
  getUpcoming: protectedProcedure
    .input(
      z.object({
        daysAhead: z.number().int().min(1).max(90).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      const today = new Date().toISOString().split("T")[0];
      const future = new Date(
        Date.now() + input.daysAhead * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .split("T")[0];

      const { data, error } = await ctx.supabase
        .from("task")
        .select(
          `id, title, description, status, priority, due_date,
           client_id, client:client_id (id, full_name)`
        )
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .in("status", ["todo", "in_progress"])
        .gte("due_date", today)
        .lte("due_date", future)
        .order("due_date", { ascending: true });

      if (error) {
        console.error("[router/task.getUpcoming]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return data ?? [];
    }),

  /**
   * Create a new task.
   */
  create: protectedProcedure
    .input(createTaskSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify client ownership if clientId provided
      if (input.clientId) {
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
      }

      const { data, error } = await ctx.supabase
        .from("task")
        .insert({
          partner_id: ctx.partnerId,
          client_id: input.clientId ?? null,
          title: input.title,
          description: input.description ?? null,
          status: input.status,
          priority: input.priority,
          due_date: input.dueDate ?? null,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nella creazione del task.",
        });
      }

      return { id: data.id };
    }),

  /**
   * Update task fields.
   */
  update: protectedProcedure
    .input(updateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (fields.title !== undefined) updates.title = fields.title;
      if (fields.description !== undefined) updates.description = fields.description;
      if (fields.priority !== undefined) updates.priority = fields.priority;
      if (fields.dueDate !== undefined) updates.due_date = fields.dueDate;
      if (fields.clientId !== undefined) updates.client_id = fields.clientId;

      if (fields.status !== undefined) {
        updates.status = fields.status;
        if (fields.status === "done") {
          updates.completed_at = new Date().toISOString();
        } else {
          updates.completed_at = null;
        }
      }

      const { error } = await ctx.supabase
        .from("task")
        .update(updates)
        .eq("id", id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null);

      if (error) {
        console.error("[router/task.update]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      return { success: true };
    }),

  /**
   * Soft-delete a task.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("task")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/task.delete]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'eliminazione. Riprova." });
      }

      return { success: true };
    }),
});
