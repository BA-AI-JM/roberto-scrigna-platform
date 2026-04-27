/**
 * Guidance Router
 *
 * tRPC procedures for the guidance block system:
 * - list: all 23 block metadata (no condition eval)
 * - select: evaluate blocks for a given client context and return applicable ones
 * - getForPlan: evaluate blocks using a plan's stored client data
 * - listDbBlocks: partner's custom guidance blocks stored in the DB
 * - createDbBlock: create a custom guidance block
 * - updateDbBlock: edit a custom block
 * - deleteDbBlock: soft-delete a custom block
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  listAllGuidanceBlocks,
  selectGuidanceBlocks,
} from "../../services/guidance";
import type { GuidanceBlockContext } from "../../services/guidance";

// ── Schemas ──────────────────────────────────────────────────────────────────

/** Inline context schema for on-demand block selection */
const guidanceContextSchema = z.object({
  snapshot: z.object({
    sex: z.enum(["male", "female"]),
    ageYears: z.number().int().min(10).max(120),
    weightKg: z.number().min(20).max(400),
    heightCm: z.number().min(100).max(250),
    dailySteps: z.number().int().min(0).max(100000),
    occupationalLevel: z.enum([
      "sedentary",
      "light",
      "moderate",
      "heavy",
      "very_heavy",
    ]),
    weekSchedule: z
      .array(z.enum(["training", "rest", "refeed", "deload"]))
      .length(7),
  }),
  bodyComposition: z.object({
    bodyFatPct: z.number().min(2).max(70),
    leanMassKg: z.number().min(20).max(300),
    fatMassKg: z.number().min(2).max(300),
  }),
  allenamento: z
    .object({
      frequencyPerWeek: z.number().int().min(0).max(14),
      modalities: z.array(z.string()),
      experienceYears: z.number().min(0).max(50),
      currentProgramme: z.string().optional(),
      limitations: z.array(z.string()).optional(),
    })
    .optional(),
  stileVita: z
    .object({
      occupation: z.string(),
      sleepHours: z.number().min(0).max(24),
      currentDiet: z.string().optional(),
      currentSupplements: z.array(z.string()).optional(),
      allergies: z.array(z.string()).optional(),
      stressLevel: z.number().min(1).max(10).optional(),
    })
    .optional(),
  obiettivo: z
    .object({
      primaryGoal: z.string(),
      targetWeightKg: z.number().optional(),
      targetBodyFatPct: z.number().optional(),
      timelineWeeks: z.number().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  dayTypes: z.array(z.enum(["training", "rest", "refeed", "deload"])),
  trainingDaysPerWeek: z.number().int().min(0).max(14),
  isDeficit: z.boolean(),
  isSurplus: z.boolean(),
  avgWeeklyTdeeKcal: z.number().min(500).max(10000),
  excludedAllergens: z.array(z.string()).optional(),
});

// ── Router ───────────────────────────────────────────────────────────────────

/** Guidance block tRPC router */
export const guidanceRouter = router({
  /**
   * List all 23 block IDs, titles, and categories without evaluating conditions.
   */
  listAll: protectedProcedure.query(() => {
    return listAllGuidanceBlocks();
  }),

  /**
   * Select applicable guidance blocks for a given client context.
   * Evaluates all 23 conditions and returns only the matching blocks.
   */
  select: protectedProcedure
    .input(guidanceContextSchema)
    .mutation(({ input }) => {
      // Cast the validated input to the internal context type
      const ctx: GuidanceBlockContext = {
        snapshot: {
          sex: input.snapshot.sex,
          ageYears: input.snapshot.ageYears,
          weightKg: input.snapshot.weightKg,
          heightCm: input.snapshot.heightCm,
          dailySteps: input.snapshot.dailySteps,
          occupationalLevel: input.snapshot.occupationalLevel,
          weekSchedule: input.snapshot.weekSchedule as GuidanceBlockContext["snapshot"]["weekSchedule"],
        },
        bodyComposition: input.bodyComposition,
        allenamento: input.allenamento,
        stileVita: input.stileVita,
        obiettivo: input.obiettivo,
        dayTypes: input.dayTypes as GuidanceBlockContext["dayTypes"],
        trainingDaysPerWeek: input.trainingDaysPerWeek,
        isDeficit: input.isDeficit,
        isSurplus: input.isSurplus,
        avgWeeklyTdeeKcal: input.avgWeeklyTdeeKcal,
        excludedAllergens: input.excludedAllergens,
      };

      return selectGuidanceBlocks(ctx);
    }),

  // ── Partner Custom DB Blocks ─────────────────────────────────────────────

  /**
   * List partner's custom guidance blocks stored in the database.
   */
  listDbBlocks: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("guidance_block")
        .select("id, title, content, category, tags, is_template, sort_order, created_at, updated_at")
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.category) {
        query = query.eq("category", input.category);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[router/guidance.listDbBlocks]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
      }

      return data ?? [];
    }),

  /**
   * Create a custom guidance block in the database.
   */
  createDbBlock: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(300),
        content: z.string().min(1).max(10000),
        category: z.string().max(100).optional(),
        tags: z.array(z.string()).optional(),
        isTemplate: z.boolean().default(false),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("guidance_block")
        .insert({
          partner_id: ctx.partnerId,
          title: input.title,
          content: input.content,
          category: input.category ?? null,
          tags: input.tags ?? [],
          is_template: input.isTemplate,
          sort_order: input.sortOrder,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Errore nella creazione del blocco.",
        });
      }

      return { id: data.id };
    }),

  /**
   * Update a custom guidance block.
   */
  updateDbBlock: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(300).optional(),
        content: z.string().min(1).max(10000).optional(),
        category: z.string().max(100).optional(),
        tags: z.array(z.string()).optional(),
        isTemplate: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (fields.title !== undefined) updates.title = fields.title;
      if (fields.content !== undefined) updates.content = fields.content;
      if (fields.category !== undefined) updates.category = fields.category;
      if (fields.tags !== undefined) updates.tags = fields.tags;
      if (fields.isTemplate !== undefined) updates.is_template = fields.isTemplate;
      if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;

      const { error } = await ctx.supabase
        .from("guidance_block")
        .update(updates)
        .eq("id", id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null);

      if (error) {
        console.error("[router/guidance.updateDbBlock]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'aggiornamento. Riprova." });
      }

      return { success: true };
    }),

  /**
   * Soft-delete a custom guidance block.
   */
  deleteDbBlock: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("guidance_block")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/guidance.deleteDbBlock]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nell'eliminazione. Riprova." });
      }

      return { success: true };
    }),
});
