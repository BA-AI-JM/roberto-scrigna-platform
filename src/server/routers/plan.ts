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
import { supplementEditItemSchema } from "../schemas/supplement-edit-schema";
import { inngest } from "../../lib/inngest/client";
import {
  generatePlan,
  serializePlanResult,
} from "../../services/plan-generator";
import type { PlanGenerationInput, InjuryStressSpec } from "../../services/plan-generator";
import type { ClientSnapshot, DayType } from "../../engine/types";
import type { PdfClientInfo } from "../../pdf/types";
import { sendEmail } from "../../lib/resend/client";
import { createSupabaseServiceRole } from "../../lib/supabase/service";
import { ensurePortalAuthUser } from "../../services/portal-auth";
import { withinReconcileTolerance } from "../../engine/meal-plan/reconcile";
import type { SourcePin } from "../../engine/meal-plan/types";
import { foodCatalogue } from "../../engine/meal-plan";
import {
  recomputeSwappedIngredient,
  macrosFromIngredients,
  clampAdjustedGrams,
} from "../../engine/meal-plan";
import {
  buildTrainingSessionFromIntake,
  buildTrainingSessionForDay,
  type IntakeTrainingSession,
} from "../../services/training-modality";
import { roundGrams } from "../../engine/meal-plan/rounding";
import {
  computeNextVersion,
  orderVersionsNewestFirst,
  rootPlanIdOf,
  carrySupplementsForward,
  type VersionRow,
} from "../plan-versioning";

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
              <p style="margin:0;font-size:13px;color:#6b7280;">Roberto Scrigna — Nutrizione Sportiva</p>
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

// #16b coach source pins: per day-type, per pinnable category → forced foodId.
const sourcePinSchema = z.object({
  PROTEIN: z.object({ foodId: z.string() }).optional(),
  CARB: z.object({ foodId: z.string() }).optional(),
  VEG: z.object({ foodId: z.string() }).optional(),
  FAT: z.object({ foodId: z.string() }).optional(),
  FRUIT: z.object({ foodId: z.string() }).optional(),
});
const sourcePinsByDaySchema = z
  .object({
    training: sourcePinSchema.optional(),
    rest: sourcePinSchema.optional(),
    refeed: sourcePinSchema.optional(),
    deload: sourcePinSchema.optional(),
    // #17 periodization intensity tiers
    training_light: sourcePinSchema.optional(),
    training_medium: sourcePinSchema.optional(),
    training_intense: sourcePinSchema.optional(),
    training_double: sourcePinSchema.optional(),
  })
  .optional();

// #26 injury/stress adaptation (opt-in; absent = byte-identical). Ranges are
// sanity bounds; provisional default VALUES are a Roberto-calibration point.
const injuryStressSchema = z
  .object({
    stressFactor: z.number().min(0.5).max(1.5).optional(),
    injuryProteinBumpGPerKg: z.number().min(0).max(2).optional(),
    reducedActivitySteps: z.number().int().min(0).max(40000).optional(),
  })
  .optional();

// #17: one per-day macro-override shape, reused for every day-type (incl. the
// periodization intensity tiers) across both generate + previewWeek.
const macroOverrideDaySchema = z
  .object({
    proteinG: z.number().min(0).max(800).optional(),
    fatG: z.number().min(0).max(400).optional(),
    carbG: z.number().min(0).max(1500).optional(),
  })
  .optional();
const macroOverridesSchema = z
  .object({
    training: macroOverrideDaySchema,
    rest: macroOverrideDaySchema,
    refeed: macroOverrideDaySchema,
    deload: macroOverrideDaySchema,
    training_light: macroOverrideDaySchema,
    training_medium: macroOverrideDaySchema,
    training_intense: macroOverrideDaySchema,
    training_double: macroOverrideDaySchema,
  })
  .optional();

const generatePlanSchema = z.object({
  clientId: z.string().uuid(),
  mealCount: z.number().min(3).max(6).optional().default(4),
  excludeAllergens: z.array(z.string()).optional(),
  preferTags: z.array(z.string()).optional(),
  maintenanceKcalEstimate: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
  /**
   * Optional override for this plan only: goal + target weight + target
   * date. Stored on macro_payload.goalOverride for the review UI; doesn't
   * mutate the underlying client snapshot.
   */
  goalOverride: z
    .object({
      goal: z.enum(["fat_loss", "muscle_gain", "maintenance", "performance"]).optional(),
      targetWeightKg: z.number().positive().max(400).optional(),
      targetEventDate: z.string().optional(),
    })
    .optional(),
  /**
   * Daily kcal deficit (positive) or surplus (negative). When set, the
   * engine applies this to every day's TDEE before computing macros, so
   * the weekly average intake shifts to (avg TDEE − deficit). Client UI
   * computes this from goalOverride + the latest snapshot via the
   * goal-rate engine module. Bounded ±1500 kcal/day defensively.
   */
  dailyDeficitKcal: z.number().min(-1500).max(1500).optional(),
  /**
   * Override the snapshot's stored 7-day schedule for this plan only.
   * Lets the practitioner pick OFF / ON / refeed / deload per weekday
   * without mutating the intake. Stored on macro_payload for replay.
   */
  weekScheduleOverride: z
    .array(
      z.enum([
        "training",
        "rest",
        "refeed",
        "deload",
        // #17 periodization intensity tiers (modes 3-4)
        "training_light",
        "training_medium",
        "training_intense",
        "training_double",
      ])
    )
    .length(7)
    .optional(),
  /**
   * #17 periodization mode the coach chose (which day-type vocabulary the week
   * is built from). Pure label for replay/audit — the engine is vocabulary-
   * driven (one plan per distinct day-type in weekScheduleOverride) and does
   * NOT branch on this. Stored on macro_payload, recovered by createVersion.
   */
  periodizationMode: z
    .enum(["weekly_average", "training_rest", "off_medium_intense", "off_light_medium_intense_double"])
    .optional(),
  /**
   * Per-weekday training session override (length-7, Mon-Sun). Each
   * entry is an array of intake sessions (`{modality, duration_min, rpe}`)
   * or null/empty for "use the global default for this day". Server
   * resolves each entry into a single ExerciseSession via
   * buildTrainingSessionForDay and passes them to the engine as
   * `perDayTrainingSession`.
   */
  perDayTrainingSession: z
    .array(
      z
        .array(
          z.object({
            modality: z.string().max(80).optional(),
            duration_min: z.number().min(1).max(480).optional(),
            rpe: z.number().min(1).max(10).optional(),
          })
        )
        .nullable()
    )
    .length(7)
    .optional(),
  /**
   * Per-day-type absolute macro overrides (grams). When set, the engine
   * pins those macros instead of using the g/kg formulas. Any subset of
   * P/F/C may be set per day-type; unset macros still use the formula.
   */
  macroOverrides: macroOverridesSchema,
  /**
   * #11 combat-sport protocols (OFF by default, combinable for fight week).
   * Restriction caps are JOINT constraints on the solved plan (kcal+protein
   * protected); water_loading produces a multi-day fluid schedule.
   */
  protocols: z
    .object({
      fibreRestriction: z.boolean().optional(),
      sodiumRestriction: z.boolean().optional(),
      waterLoading: z.boolean().optional(),
    })
    .optional(),
  /** #16b coach source pins (per day-type → category → foodId). */
  sourcePins: sourcePinsByDaySchema,
  /** #26 injury/stress adaptation (opt-in; absent = no effect). */
  injuryStress: injuryStressSchema,
});

const previewWeekSchema = z.object({
  clientId: z.string().uuid(),
  weekScheduleOverride: z
    .array(
      z.enum([
        "training",
        "rest",
        "refeed",
        "deload",
        // #17 periodization intensity tiers (modes 3-4)
        "training_light",
        "training_medium",
        "training_intense",
        "training_double",
      ])
    )
    .length(7)
    .optional(),
  perDayTrainingSession: z
    .array(
      z
        .array(
          z.object({
            modality: z.string().max(80).optional(),
            duration_min: z.number().min(1).max(480).optional(),
            rpe: z.number().min(1).max(10).optional(),
          })
        )
        .nullable()
    )
    .length(7)
    .optional(),
  dailyDeficitKcal: z.number().min(-1500).max(1500).optional(),
  macroOverrides: macroOverridesSchema,
  /** #16b — accepted for input symmetry; source pins don't affect the macro preview. */
  sourcePins: sourcePinsByDaySchema,
  /** #26 injury/stress adaptation (opt-in; absent = no effect). */
  injuryStress: injuryStressSchema,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pull the per-day training sessions captured at intake (stored under
 * skinfold_data._intake.training_sessions) out of a client_snapshot row.
 */
export function intakeTrainingSessions(
  snapshotRow: Record<string, unknown>
): Record<string, IntakeTrainingSession[]> | undefined {
  const skinfoldRaw = snapshotRow.skinfold_data as Record<string, unknown> | null;
  const intake = skinfoldRaw?._intake as Record<string, unknown> | undefined;
  return intake?.training_sessions as Record<string, IntakeTrainingSession[]> | undefined;
}

/**
 * Map a raw client_snapshot DB row into a ClientSnapshot for the engine.
 * The snapshot row stores sex on the client table, so both are passed in.
 */
export function buildEngineSnapshot(
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

// ── Shared plan-artifact builder (generate + createVersion) ──────────────────

/** Generation parameters recoverable from wizard input or a stored plan's macro_payload. */
interface PlanGenParams {
  mealCount: number;
  excludeAllergens?: string[];
  preferTags?: string[];
  maintenanceKcalEstimate?: number;
  dailyDeficitKcal?: number;
  goalOverride?: Record<string, unknown>;
  weekScheduleOverride?: unknown;
  /** #17 periodization mode label (replay/audit only; engine doesn't branch on it). */
  periodizationMode?: string;
  /** Raw per-weekday training-session arrays (as stored on macro_payload / wizard input). */
  perDayTrainingSession?: (IntakeTrainingSession[] | null)[];
  macroOverrides?: Partial<Record<DayType, { proteinG?: number; fatG?: number; carbG?: number }>>;
  /** #11 combat-sport protocols (fibre/sodium restriction + water loading). */
  protocols?: { fibreRestriction?: boolean; sodiumRestriction?: boolean; waterLoading?: boolean };
  /** #16b coach source pins (per day-type → category → foodId). */
  sourcePins?: Partial<Record<DayType, SourcePin>>;
  /** #26 injury/stress adaptation (opt-in; absent = byte-identical). */
  injuryStress?: InjuryStressSpec;
}

interface PlanArtifacts {
  serialized: ReturnType<typeof serializePlanResult>;
  macroPayload: Record<string, unknown>;
  weeklyAverageKcal: number;
  energyBalance: string;
}

/**
 * Run the engine for a snapshot + generation params and produce the persisted
 * artifacts (serialized bundle + macro_payload summary). Pure w.r.t. the DB: the
 * caller fetches the snapshot/client and persists the result. Shared by
 * `generate` (params from the wizard) and `createVersion` (params recovered from
 * the source plan's macro_payload, re-run against the latest snapshot). Throws
 * the raw engine error; callers translate to a TRPCError.
 */
function buildPlanArtifacts(
  snapshotRecord: Record<string, unknown>,
  clientSex: "male" | "female",
  clientInfo: PdfClientInfo,
  params: PlanGenParams
): PlanArtifacts {
  const snapshotBase = buildEngineSnapshot(snapshotRecord, clientSex);
  const snapshot: ClientSnapshot = params.weekScheduleOverride
    ? { ...snapshotBase, weekSchedule: params.weekScheduleOverride as ClientSnapshot["weekSchedule"] }
    : snapshotBase;

  const trainingSession = buildTrainingSessionFromIntake(
    intakeTrainingSessions(snapshotRecord),
    snapshot.weekSchedule
  );
  const perDayTrainingSession =
    params.perDayTrainingSession?.map((daySessions) =>
      buildTrainingSessionForDay(daySessions ?? null)
    ) ?? undefined;

  const engineOptions: PlanGenerationInput["engineOptions"] = {};
  if (trainingSession) engineOptions.trainingSession = trainingSession;
  if (params.dailyDeficitKcal != null && params.dailyDeficitKcal !== 0) {
    engineOptions.dailyDeficitKcal = params.dailyDeficitKcal;
  }
  if (perDayTrainingSession && perDayTrainingSession.some((s) => s != null)) {
    engineOptions.perDayTrainingSession = perDayTrainingSession;
  }
  if (params.macroOverrides) {
    const cleaned: NonNullable<typeof params.macroOverrides> = {};
    for (const [dt, override] of Object.entries(params.macroOverrides) as Array<
      [DayType, { proteinG?: number; fatG?: number; carbG?: number } | undefined]
    >) {
      if (override && (override.proteinG != null || override.fatG != null || override.carbG != null)) {
        cleaned[dt] = override;
      }
    }
    if (Object.keys(cleaned).length > 0) {
      engineOptions.macroOptions = { absoluteOverrides: cleaned };
    }
  }

  const genInput: PlanGenerationInput = {
    clientInfo,
    snapshot,
    mealCount: params.mealCount,
    excludeAllergens: params.excludeAllergens as PlanGenerationInput["excludeAllergens"],
    preferTags: params.preferTags as PlanGenerationInput["preferTags"],
    maintenanceKcalEstimate: params.maintenanceKcalEstimate,
    ...(Object.keys(engineOptions).length > 0 ? { engineOptions } : {}),
    ...(params.protocols ? { protocols: params.protocols } : {}),
    ...(params.sourcePins ? { sourcePins: params.sourcePins } : {}),
    ...(params.injuryStress ? { injuryStress: params.injuryStress } : {}),
  };

  const result = generatePlan(genInput);
  const serialized = serializePlanResult(result);

  const uniqueDayTypes = [...new Set(snapshot.weekSchedule)];
  const macroPayload: Record<string, unknown> = {
    weeklyAverageKcal: result.weeklyPlan.weeklyAverageKcal,
    weeklyAverageProteinG: result.weeklyPlan.weeklyAverageProteinG,
    dayTypes: uniqueDayTypes,
    energyBalance: result.energyBalance,
    ...(params.dailyDeficitKcal != null ? { dailyDeficitKcal: params.dailyDeficitKcal } : {}),
    ...(params.goalOverride ? { goalOverride: params.goalOverride } : {}),
    ...(params.weekScheduleOverride ? { weekScheduleOverride: params.weekScheduleOverride } : {}),
    ...(params.periodizationMode ? { periodizationMode: params.periodizationMode } : {}),
    ...(params.perDayTrainingSession ? { perDayTrainingSessionRaw: params.perDayTrainingSession } : {}),
    ...(params.macroOverrides ? { macroOverrides: params.macroOverrides } : {}),
    ...(params.excludeAllergens ? { excludeAllergens: params.excludeAllergens } : {}),
    ...(params.preferTags ? { preferTags: params.preferTags } : {}),
    ...(params.protocols ? { protocols: params.protocols } : {}),
    ...(params.sourcePins ? { sourcePins: params.sourcePins } : {}),
    ...(params.injuryStress ? { injuryStress: params.injuryStress } : {}),
    ...(result.waterLoading ? { waterLoading: result.waterLoading } : {}),
  };

  return {
    serialized,
    macroPayload,
    weeklyAverageKcal: result.weeklyPlan.weeklyAverageKcal,
    energyBalance: result.energyBalance as string,
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

      // 3. Engine snapshot context.
      const clientSex: "male" | "female" =
        (client.sex as "male" | "female") ?? "male";
      const snapshotRecord = snapshotRow as unknown as Record<string, unknown>;

      // 4. Build client info for PDF cover.
      const planDate = new Date().toISOString().split("T")[0]!;
      const clientInfo: PdfClientInfo = {
        fullName: client.full_name,
        email: client.email ?? undefined,
        phone: client.phone ?? undefined,
        dateOfBirth: client.date_of_birth ?? undefined,
        planDate,
      };

      // 5-7. Run the engine + derive artifacts (shared with createVersion).
      let artifacts: PlanArtifacts;
      try {
        artifacts = buildPlanArtifacts(snapshotRecord, clientSex, clientInfo, {
          mealCount: input.mealCount,
          excludeAllergens: input.excludeAllergens,
          preferTags: input.preferTags,
          maintenanceKcalEstimate: input.maintenanceKcalEstimate,
          dailyDeficitKcal: input.dailyDeficitKcal,
          goalOverride: input.goalOverride,
          weekScheduleOverride: input.weekScheduleOverride,
          periodizationMode: input.periodizationMode,
          perDayTrainingSession: input.perDayTrainingSession,
          macroOverrides: input.macroOverrides,
          protocols: input.protocols,
          sourcePins: input.sourcePins,
          injuryStress: input.injuryStress,
        });
      } catch (err) {
        // Preserve intentional errors (e.g. a nested PRECONDITION_FAILED) with their
        // specific code + message — don't re-mask them as the generic "dati completi".
        if (err instanceof TRPCError) throw err;
        // Genuinely-unexpected engine error: log it server-side with FULL fidelity
        // (this is exactly what let us catch the food-CSV ENOENT once we tailed prod
        // logs), then surface a safe, friendly message without leaking internals.
        console.error(
          "[router/plan.generate] engine error:",
          err,
          err instanceof Error ? err.stack : ""
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella generazione del piano. Verifica che tutti i dati del cliente siano completi.",
        });
      }

      // 8. Persist plan to DB. plan_bundle + macro_payload live in daily_targets
      //    JSONB (overloaded to carry the full serialized result, queryable).
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
            macro_payload: artifacts.macroPayload,
            plan_bundle: artifacts.serialized,
          },
          meals_per_day: input.mealCount,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();

      if (planError || !plan) {
        console.error("[router/plan.generate] plan insert:", planError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio del piano.",
        });
      }

      return {
        planId: plan.id,
        planName,
        weeklyAverageKcal: artifacts.weeklyAverageKcal,
        energyBalance: artifacts.energyBalance,
      };
    }),

  /**
   * Create a new VERSION of an existing plan (lifecycle-spine increment 1).
   *
   * Clones the source plan as a new row in the same version chain: parent_plan_id
   * points at the chain ROOT, version_number = max(chain) + 1, and version_label
   * follows Roberto's convention — a tweak/regeneration is a MINOR bump
   * (v1 → v1.1), a brand-new plan is a MAJOR bump (v1.x → v2). The bundle is
   * REGENERATED from the latest snapshot (which reflects the latest check-in's
   * measurements) reusing the source plan's generation params; the prompting
   * check-in is linked via feedback_check_in_id. The prior version is archived.
   * A calorie tweak is just createVersion (kind defaults to "minor").
   */
  createVersion: protectedProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        changeReason: z.string().max(2000).optional(),
        kind: z.enum(["minor", "major"]).optional().default("minor"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Source plan (ownership + version context).
      const { data: src, error: srcErr } = await ctx.supabase
        .from("plan")
        .select(
          "id, client_id, parent_plan_id, version_number, version_label, meals_per_day, daily_targets"
        )
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (srcErr || !src) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Piano non trovato." });
      }

      const rootId = rootPlanIdOf({ id: src.id, parent_plan_id: src.parent_plan_id });

      // 2. The whole version chain (root + descendants) → next number + label.
      const { data: chainRows } = await ctx.supabase
        .from("plan")
        .select("id, version_number, version_label")
        .eq("partner_id", ctx.partnerId)
        .or(`id.eq.${rootId},parent_plan_id.eq.${rootId}`)
        .is("deleted_at", null);

      const chain: VersionRow[] = (chainRows ?? []).map((r) => ({
        versionNumber: (r.version_number as number | null) ?? 1,
        versionLabel: (r.version_label as string | null) ?? null,
      }));
      const { versionNumber, versionLabel } = computeNextVersion(chain, input.kind);

      // 3. Client + latest snapshot (reflects the latest check-in) + latest check-in.
      const { data: client, error: clientErr } = await ctx.supabase
        .from("client")
        .select("id, full_name, email, phone, date_of_birth, sex")
        .eq("id", src.client_id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();
      if (clientErr || !client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      const { data: snapshotRow, error: snapErr } = await ctx.supabase
        .from("client_snapshot")
        .select("*")
        .eq("client_id", src.client_id)
        .order("taken_at", { ascending: false })
        .limit(1)
        .single();
      if (snapErr || !snapshotRow) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Nessuna misurazione trovata per questo cliente.",
        });
      }

      const { data: latestCheckin } = await ctx.supabase
        .from("check_in")
        .select("id")
        .eq("client_id", src.client_id)
        .eq("partner_id", ctx.partnerId)
        .in("status", ["completed", "reviewed"])
        // nullsFirst:false — a 'reviewed' check-in can have NULL completed_at
        // (markReviewed sets reviewed_at, not completed_at); keep those last so
        // the most recently completed one wins. created_at is the tiebreak.
        .order("completed_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 4. Recover the source plan's generation params and regenerate the bundle
      //    against the latest snapshot.
      const srcDt = (src.daily_targets as Record<string, unknown> | null) ?? {};
      const mp = (srcDt.macro_payload as Record<string, unknown> | undefined) ?? {};
      const srcBundle = srcDt.plan_bundle as Record<string, unknown> | undefined;
      const clientSex: "male" | "female" = (client.sex as "male" | "female") ?? "male";
      const snapshotRecord = snapshotRow as unknown as Record<string, unknown>;
      const planDate = new Date().toISOString().split("T")[0]!;
      const clientInfo: PdfClientInfo = {
        fullName: client.full_name,
        email: client.email ?? undefined,
        phone: client.phone ?? undefined,
        dateOfBirth: client.date_of_birth ?? undefined,
        planDate,
      };

      let artifacts: PlanArtifacts;
      try {
        artifacts = buildPlanArtifacts(snapshotRecord, clientSex, clientInfo, {
          mealCount: (src.meals_per_day as number | null) ?? 4,
          excludeAllergens: mp.excludeAllergens as string[] | undefined,
          preferTags: mp.preferTags as string[] | undefined,
          maintenanceKcalEstimate:
            (mp.maintenanceEstimate as number | undefined) ??
            (mp.maintenanceKcalEstimate as number | undefined),
          dailyDeficitKcal: mp.dailyDeficitKcal as number | undefined,
          goalOverride: mp.goalOverride as Record<string, unknown> | undefined,
          weekScheduleOverride: mp.weekScheduleOverride,
          // #17: preserve the periodization mode label across versions.
          periodizationMode: mp.periodizationMode as PlanGenParams["periodizationMode"],
          perDayTrainingSession: mp.perDayTrainingSessionRaw as
            | PlanGenParams["perDayTrainingSession"],
          macroOverrides: mp.macroOverrides as PlanGenParams["macroOverrides"],
          // Preserve fight-week protocols across versions (recovered from macro_payload).
          protocols: mp.protocols as PlanGenParams["protocols"],
          // #16b: preserve coach source pins across versions.
          sourcePins: mp.sourcePins as PlanGenParams["sourcePins"],
          // #26: preserve injury/stress adaptation across versions.
          injuryStress: mp.injuryStress as PlanGenParams["injuryStress"],
        });
      } catch (err) {
        // Preserve intentional errors; log unexpected ones with full fidelity.
        if (err instanceof TRPCError) throw err;
        console.error(
          "[router/plan.createVersion] engine error:",
          err,
          err instanceof Error ? err.stack : ""
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella rigenerazione del piano.",
        });
      }

      // #23: carry the PARENT version's coach-curated supplements forward — the
      // engine now seeds ZERO supplements, so a regenerate would otherwise drop
      // them. Supplements live in the bundle (daily_targets.plan_bundle.supplements).
      carrySupplementsForward(
        artifacts.serialized as { supplements?: unknown[] },
        srcBundle
      );

      // 5. Insert the new version row.
      const planName = `Piano ${client.full_name} — ${planDate} (${versionLabel})`;
      const { data: newPlan, error: insErr } = await ctx.supabase
        .from("plan")
        .insert({
          client_id: src.client_id,
          snapshot_id: snapshotRow.id,
          partner_id: ctx.partnerId,
          name: planName,
          status: "draft",
          parent_plan_id: rootId,
          version_number: versionNumber,
          version_label: versionLabel,
          change_reason: input.changeReason ?? null,
          feedback_check_in_id: latestCheckin?.id ?? null,
          daily_targets: {
            macro_payload: artifacts.macroPayload,
            plan_bundle: artifacts.serialized,
          },
          meals_per_day: (src.meals_per_day as number | null) ?? 4,
        })
        .select("id")
        .single();

      if (insErr || !newPlan) {
        console.error("[router/plan.createVersion] insert:", insErr);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio della nuova versione.",
        });
      }

      // 6. Archive the prior version (the source).
      await ctx.supabase
        .from("plan")
        .update({ status: "archived" })
        .eq("id", src.id)
        .eq("partner_id", ctx.partnerId);

      return {
        planId: newPlan.id,
        planName,
        versionNumber,
        versionLabel,
        parentPlanId: rootId,
        archivedPlanId: src.id,
        feedbackCheckInId: latestCheckin?.id ?? null,
        weeklyAverageKcal: artifacts.weeklyAverageKcal,
        energyBalance: artifacts.energyBalance,
      };
    }),

  /**
   * List the version chain for a client (or a specific root plan), newest-first.
   * Coach-visible (partner-scoped). Returns each version's number, label, status,
   * change reason and the linked feedback check-in.
   */
  listVersions: protectedProcedure
    .input(
      z
        .object({
          clientId: z.string().uuid().optional(),
          rootPlanId: z.string().uuid().optional(),
        })
        .refine((d) => d.clientId || d.rootPlanId, {
          message: "Fornire clientId o rootPlanId.",
        })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("plan")
        .select(
          "id, name, status, version_number, version_label, change_reason, parent_plan_id, feedback_check_in_id, created_at, client_id"
        )
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (input.rootPlanId) {
        query = query.or(
          `id.eq.${input.rootPlanId},parent_plan_id.eq.${input.rootPlanId}`
        );
      } else {
        query = query.eq("client_id", input.clientId as string);
      }

      const { data: rows, error } = await query;
      if (error) {
        console.error("[router/plan.listVersions]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel caricamento delle versioni.",
        });
      }

      const versions = (rows ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        status: r.status as string,
        versionNumber: (r.version_number as number | null) ?? 1,
        versionLabel: (r.version_label as string | null) ?? "v1",
        changeReason: (r.change_reason as string | null) ?? null,
        parentPlanId: (r.parent_plan_id as string | null) ?? null,
        feedbackCheckInId: (r.feedback_check_in_id as string | null) ?? null,
        createdAt: r.created_at as string,
      }));

      // Stable: DB returns created_at desc; sort by version_number desc keeps the
      // chain newest-first while preserving created_at order on ties.
      return { versions: orderVersionsNewestFirst(versions) };
    }),

  /**
   * Read-only engine preview for a client: fetches the latest snapshot,
   * runs the engine (with the same intake-derived training session the real
   * `generate` would use), and returns the data the configure-plan wizard
   * needs to drive its live readouts. No DB writes; cheap to call on every
   * client-selection change.
   */
  estimateForClient: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: client } = await ctx.supabase
        .from("client")
        .select("sex")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      const { data: snapshotRow } = await ctx.supabase
        .from("client_snapshot")
        .select("*")
        .eq("client_id", input.clientId)
        .order("taken_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!snapshotRow) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Nessuna misurazione per questo cliente — completa prima il modulo di intake.",
        });
      }

      const clientSex = (client.sex as "male" | "female") ?? "male";
      const snapshotRecord = snapshotRow as unknown as Record<string, unknown>;
      const snapshot = buildEngineSnapshot(snapshotRecord, clientSex);
      const trainingSession = buildTrainingSessionFromIntake(
        intakeTrainingSessions(snapshotRecord),
        snapshot.weekSchedule
      );
      const { generateWeeklyPlan } = await import("../../engine");
      const weeklyPlan = generateWeeklyPlan(
        snapshot,
        trainingSession ? { trainingSession } : {}
      );

      const avgTdeeKcal = Math.round(
        weeklyPlan.days.reduce((sum, d) => sum + d.tdee.totalTdeeKcal, 0) /
          weeklyPlan.days.length
      );
      const leanMassKg = weeklyPlan.days[0]!.tdee.bmr.bodyComposition.leanMassKg;

      // The saved goal lives inside skinfold_data._intake.goal (the intake
      // form's blob). Pull it out so the wizard can pre-fill.
      const skinfoldRaw = snapshotRecord.skinfold_data as Record<string, unknown> | null;
      const intake = (skinfoldRaw?._intake as Record<string, unknown> | undefined) ?? {};
      const savedGoal = (intake.goal as
        | {
            goal?: string;
            target_weight_kg?: number;
            target_event?: string;
            target_event_date?: string;
          }
        | undefined) ?? null;

      return {
        weightKg: snapshot.weightKg,
        leanMassKg: Math.round(leanMassKg * 10) / 10,
        avgTdeeKcal,
        savedGoal,
        weekSchedule: snapshot.weekSchedule as DayType[],
        intakeTrainingSessions: intakeTrainingSessions(snapshotRecord) ?? {},
      };
    }),

  /**
   * Live preview of a 7-day plan for the "Struttura del piano" wizard.
   * Runs the engine with the proposed weekSchedule + per-day training
   * sessions (and optional deficit) and returns per-day kcal/macros plus
   * the weekly average. No DB writes — safe to call on every UI edit.
   */
  previewWeek: protectedProcedure
    .input(previewWeekSchema)
    .query(async ({ ctx, input }) => {
      const { data: client } = await ctx.supabase
        .from("client")
        .select("sex")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();
      if (!client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      const { data: snapshotRow } = await ctx.supabase
        .from("client_snapshot")
        .select("*")
        .eq("client_id", input.clientId)
        .order("taken_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!snapshotRow) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Nessuna misurazione per questo cliente.",
        });
      }

      const clientSex = (client.sex as "male" | "female") ?? "male";
      const snapshotRecord = snapshotRow as unknown as Record<string, unknown>;
      const snapshotBase = buildEngineSnapshot(snapshotRecord, clientSex);

      const snapshot: ClientSnapshot = input.weekScheduleOverride
        ? {
            ...snapshotBase,
            weekSchedule: input.weekScheduleOverride as ClientSnapshot["weekSchedule"],
          }
        : snapshotBase;

      const fallbackTraining = buildTrainingSessionFromIntake(
        intakeTrainingSessions(snapshotRecord),
        snapshot.weekSchedule
      );

      const perDayTrainingSession =
        input.perDayTrainingSession?.map((daySessions) =>
          buildTrainingSessionForDay(daySessions ?? null)
        ) ?? undefined;

      const cleanedMacroOverrides = (() => {
        if (!input.macroOverrides) return undefined;
        const cleaned: NonNullable<typeof input.macroOverrides> = {};
        for (const [dt, override] of Object.entries(input.macroOverrides) as Array<
          [DayType, { proteinG?: number; fatG?: number; carbG?: number } | undefined]
        >) {
          if (
            override &&
            (override.proteinG != null || override.fatG != null || override.carbG != null)
          ) {
            cleaned[dt] = override;
          }
        }
        return Object.keys(cleaned).length > 0 ? cleaned : undefined;
      })();

      const { generateWeeklyPlan } = await import("../../engine");
      const weekly = generateWeeklyPlan(snapshot, {
        ...(fallbackTraining ? { trainingSession: fallbackTraining } : {}),
        ...(perDayTrainingSession && perDayTrainingSession.some((s) => s != null)
          ? { perDayTrainingSession }
          : {}),
        ...(input.dailyDeficitKcal != null && input.dailyDeficitKcal !== 0
          ? { dailyDeficitKcal: input.dailyDeficitKcal }
          : {}),
        ...(cleanedMacroOverrides
          ? { macroOptions: { absoluteOverrides: cleanedMacroOverrides } }
          : {}),
      });

      const days = weekly.days.map((d, i) => ({
        index: i,
        dayType: d.dayType,
        tdeeKcal: Math.round(d.tdee.totalTdeeKcal),
        exerciseKcal: Math.round(d.tdee.exercise.exerciseKcal),
        targetKcal: d.macros.totalKcal,
        proteinG: d.macros.proteinG,
        fatG: d.macros.fatG,
        carbG: d.macros.carbG,
      }));

      return {
        days,
        weeklyAverageKcal: weekly.weeklyAverageKcal,
        weeklyAverageProteinG: weekly.weeklyAverageProteinG,
        weeklyAverageTdeeKcal: Math.round(
          days.reduce((s, d) => s + d.tdeeKcal, 0) / 7
        ),
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
          "id, name, status, created_at, client_id, parent_plan_id, daily_targets, notes, meals_per_day"
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
        // Additive (#portal-plan-history): let the coach Versioni tab resolve the
        // chain root in ONE query instead of a client-side re-query.
        clientId: plan.client_id as string,
        rootPlanId: rootPlanIdOf({
          id: plan.id,
          parent_plan_id: (plan.parent_plan_id as string | null) ?? null,
        }),
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
        .select("id, client_id, daily_targets, start_date")
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

      // Validate goal type matches actual calorie balance before approval
      const dailyTargets = plan.daily_targets as Record<string, unknown> | null;
      const macroPayload = dailyTargets?.macro_payload as Record<string, unknown> | undefined;
      const planBundle = dailyTargets?.plan_bundle as Record<string, unknown> | undefined;
      if (macroPayload) {
        const energyBalance = macroPayload.energyBalance as string | undefined;
        const weeklyAvgKcal = macroPayload.weeklyAverageKcal as number | undefined;

        // maintenanceEstimate may be in macro_payload (new plans) or computed
        // from plan_bundle.weeklyPlan.days TDEE averages (existing plans)
        let maintenanceEst = macroPayload.maintenanceEstimate as number | undefined;
        if (maintenanceEst == null && planBundle) {
          const wp = (planBundle as Record<string, unknown>).weeklyPlan as Record<string, unknown> | undefined;
          const days = wp?.days as Array<Record<string, unknown>> | undefined;
          if (days && days.length > 0) {
            const tdeeSum = days.reduce((sum, d) => {
              const tdee = d.tdee as Record<string, unknown> | undefined;
              return sum + ((tdee?.totalTdeeKcal as number) ?? 0);
            }, 0);
            maintenanceEst = tdeeSum / days.length;
          }
        }

        if (
          energyBalance === "deficit" &&
          maintenanceEst != null &&
          weeklyAvgKcal != null &&
          Math.abs(weeklyAvgKcal - maintenanceEst) <= 50
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Impossibile approvare: il piano è etichettato come 'Deficit Calorico' ma le calorie corrispondono al TDEE di mantenimento. Correggi il tipo di obiettivo.",
          });
        }
      }

      // Set start_date on activation (preserving any existing value) so the
      // feedback-reminder cadence (≈21 days after start_date) becomes live.
      const activationDate =
        (plan.start_date as string | null) ?? new Date().toISOString().split("T")[0]!;
      const { error } = await ctx.supabase
        .from("plan")
        .update({ status: "active", start_date: activationDate })
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
   * Adjust meal portions for a specific day type so the day's totals hit the
   * macro target. Scales every meal slot (primary + substitutions) by a single
   * factor so macro ratios are preserved, rounds ingredient grams, recomputes
   * slot/day macros, deviation and tolerance, and persists the result back into
   * the plan bundle (both reportData.dayTypePlans and the mealPlans record).
   *
   * The meal plan is stored as a serialized DayMealPlan:
   *   { dayType, targetMacros: MacroTargets, slots: MealSlot[],
   *     actualMacros: SlotMacroTargets, deviation: MacroDeviation, withinTolerance }
   * and each MealSlot is { slot, targetMacros, primary: SelectedMeal,
   *   substitutions: SelectedMeal[] } where SelectedMeal carries
   *   scaledIngredients + actualMacros.
   */
  adjustPortions: protectedProcedure
    .input(z.object({
      planId: z.string().uuid(),
      dayType: z.string(),
      /**
       * #21 adjustment spec (OPTIONAL, additive). Absent / "target" =
       * unchanged behaviour: rescale the whole day to its calorie target
       * (scale = targetKcal/actualKcal). "relative" = bump every ingredient by
       * (1 + scalePct/100) — directional/graduated, allowed regardless of
       * tolerance — with the engine's realism rails applied per ingredient.
       */
      mode: z.enum(["target", "relative"]).optional(),
      /** Relative bump percentage, e.g. +10, +25, −10. Required when mode = "relative". */
      scalePct: z.number().min(-50).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: plan } = await ctx.supabase
        .from("plan")
        .select("id, daily_targets")
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Piano non trovato." });
      }

      const dt = plan.daily_targets as Record<string, unknown> | null;
      const bundle = dt?.plan_bundle as Record<string, unknown> | undefined;
      const report = bundle?.reportData as Record<string, unknown> | undefined;
      const dayPlans = report?.dayTypePlans as Array<Record<string, unknown>> | undefined;

      if (!dayPlans || !dt || !bundle || !report) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dati del piano mancanti." });
      }

      const dayIdx = dayPlans.findIndex((d) => d.dayType === input.dayType);
      if (dayIdx === -1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo giorno non trovato." });
      }

      type Macros = { kcal: number; proteinG: number; fatG: number; carbsG: number };
      type Ingredient = { foodId?: string; name: string; grams: number };
      type SelectedMeal = {
        template?: unknown;
        scaleFactor?: number;
        scaledIngredients?: Ingredient[];
        actualMacros?: Macros;
      };
      type Slot = { slot: string; targetMacros?: Macros; primary?: SelectedMeal; substitutions?: SelectedMeal[] };

      const day = dayPlans[dayIdx] as Record<string, unknown>;
      const mealPlan = day.mealPlan as Record<string, unknown> | undefined;
      const slots = mealPlan?.slots as Slot[] | undefined;

      // Target kcal: prefer the meal plan's own target, fall back to the day's macros.
      const planTarget = mealPlan?.targetMacros as Record<string, number> | undefined;
      const dayMacros = day.macros as Record<string, number> | undefined;
      const targetKcal = (planTarget?.totalKcal as number) ?? (dayMacros?.totalKcal as number) ?? 0;

      if (!slots || slots.length === 0 || targetKcal <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nessun pasto da aggiustare." });
      }

      const actualKcal = slots.reduce(
        (sum, s) => sum + (s.primary?.actualMacros?.kcal ?? 0),
        0
      );
      if (actualKcal <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Calorie attuali non calcolabili." });
      }

      const r1 = (n: number) => Math.round(n * 10) / 10;

      // #21: resolve the adjustment mode. "target" (default) is the original
      // rescale-to-calorie-target; "relative" is a directional ±% bump.
      const mode = input.mode ?? "target";
      if (mode === "relative" && input.scalePct == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "scalePct richiesto per la modalità relativa." });
      }

      // ── "target" mode: EXACT original behaviour (byte-identical) ──────────────
      const scale = targetKcal / actualKcal;
      const scaleMeal = (m: SelectedMeal | undefined): SelectedMeal | undefined => {
        if (!m) return m;
        const am = m.actualMacros;
        return {
          ...m,
          scaleFactor:
            m.scaleFactor != null ? Math.round(m.scaleFactor * scale * 1000) / 1000 : m.scaleFactor,
          scaledIngredients: m.scaledIngredients?.map((ing) => ({
            ...ing,
            grams: Math.max(1, roundGrams(ing.grams * scale)),
          })),
          actualMacros: am
            ? {
                kcal: Math.round((am.kcal ?? 0) * scale),
                proteinG: r1((am.proteinG ?? 0) * scale),
                fatG: r1((am.fatG ?? 0) * scale),
                carbsG: r1((am.carbsG ?? 0) * scale),
              }
            : am,
        };
      };

      // ── "relative" mode: bump every ingredient by (1 + scalePct/100), clamp to
      // the engine's realism rails, and recompute each meal's macros FROM the
      // clamped grams (so a capped bump reports honest macros). ─────────────────
      const factor = 1 + (input.scalePct ?? 0) / 100;
      const scaleMealRelative = (m: SelectedMeal | undefined): SelectedMeal | undefined => {
        if (!m) return m;
        const newIngs = m.scaledIngredients?.map((ing) => ({
          ...ing,
          grams: ing.foodId
            ? clampAdjustedGrams(ing.foodId, ing.grams * factor)
            : Math.max(1, roundGrams(ing.grams * factor)),
        }));
        let am = m.actualMacros;
        if (newIngs && newIngs.length > 0 && newIngs.every((i) => i.foodId)) {
          const mm = macrosFromIngredients(
            newIngs.map((i) => ({ foodId: i.foodId!, name: i.name, grams: i.grams }))
          );
          am = { kcal: mm.kcal, proteinG: mm.proteinG, fatG: mm.fatG, carbsG: mm.carbsG };
        } else if (am) {
          // Legacy bundle without foodIds → linear fallback.
          am = {
            kcal: Math.round((am.kcal ?? 0) * factor),
            proteinG: r1((am.proteinG ?? 0) * factor),
            fatG: r1((am.fatG ?? 0) * factor),
            carbsG: r1((am.carbsG ?? 0) * factor),
          };
        }
        return { ...m, scaledIngredients: newIngs, actualMacros: am };
      };

      const transform = mode === "relative" ? scaleMealRelative : scaleMeal;
      const adjustedSlots: Slot[] = slots.map((slot) => ({
        ...slot,
        primary: transform(slot.primary),
        substitutions: slot.substitutions?.map((sub) => transform(sub)) as SelectedMeal[] | undefined,
      }));

      // Recompute day totals from the scaled primaries.
      const newActual: Macros = adjustedSlots.reduce(
        (acc, s) => {
          const am = s.primary?.actualMacros;
          return {
            kcal: acc.kcal + (am?.kcal ?? 0),
            proteinG: r1(acc.proteinG + (am?.proteinG ?? 0)),
            fatG: r1(acc.fatG + (am?.fatG ?? 0)),
            carbsG: r1(acc.carbsG + (am?.carbsG ?? 0)),
          };
        },
        { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }
      );

      // Target macros for deviation: MacroTargets uses `carbG` (not `carbsG`) and `totalKcal`.
      const tgtProtein = (planTarget?.proteinG as number) ?? (dayMacros?.proteinG as number) ?? 0;
      const tgtFat = (planTarget?.fatG as number) ?? (dayMacros?.fatG as number) ?? 0;
      const tgtCarb =
        (planTarget?.carbG as number) ??
        (planTarget?.carbsG as number) ??
        (dayMacros?.carbG as number) ??
        0;

      const deviation = {
        kcal: newActual.kcal - targetKcal,
        proteinG: r1(newActual.proteinG - tgtProtein),
        fatG: r1(newActual.fatG - tgtFat),
        carbsG: r1(newActual.carbsG - tgtCarb),
      };
      // Protected pair (kcal + protein) via the single relative-tolerance source
      // shared with the engine (reconcile.ts) — the flag agrees with convergence (#3).
      const withinTolerance = withinReconcileTolerance(deviation, targetKcal, tgtProtein);

      const updatedMealPlan = {
        ...mealPlan,
        slots: adjustedSlots,
        actualMacros: newActual,
        deviation,
        withinTolerance,
      };

      const updatedDayPlans = [...dayPlans];
      updatedDayPlans[dayIdx] = { ...day, mealPlan: updatedMealPlan };

      // Keep the parallel `mealPlans` record (keyed by day type) in sync if present.
      const mealPlansRecord = bundle.mealPlans as Record<string, unknown> | undefined;
      const updatedMealPlansRecord =
        mealPlansRecord && Object.prototype.hasOwnProperty.call(mealPlansRecord, input.dayType)
          ? { ...mealPlansRecord, [input.dayType]: updatedMealPlan }
          : mealPlansRecord;

      const updatedDt = {
        ...dt,
        plan_bundle: {
          ...bundle,
          ...(updatedMealPlansRecord ? { mealPlans: updatedMealPlansRecord } : {}),
          reportData: {
            ...report,
            dayTypePlans: updatedDayPlans,
          },
        },
      };

      const { error } = await ctx.supabase
        .from("plan")
        .update({ daily_targets: updatedDt })
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/plan.adjustPortions]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel salvataggio." });
      }

      return {
        success: true,
        mode,
        previousKcal: Math.round(actualKcal),
        newKcal: newActual.kcal,
        scaleFactor: mode === "relative" ? factor : scale,
        withinTolerance,
      };
    }),

  /**
   * Swap the primary meal selection in a slot with one of its substitutions.
   * The new primary takes the chosen substitution's place in `substitutions[]`,
   * keeping the substitution count stable. Day totals + deviation + tolerance
   * are recomputed and the bundle is persisted (reportData + mealPlans record).
   */
  swapMealSelection: protectedProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        dayType: z.string(),
        slot: z.string(),
        substitutionTemplateId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: plan } = await ctx.supabase
        .from("plan")
        .select("id, daily_targets")
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Piano non trovato." });
      }

      const dt = plan.daily_targets as Record<string, unknown> | null;
      const bundle = dt?.plan_bundle as Record<string, unknown> | undefined;
      const report = bundle?.reportData as Record<string, unknown> | undefined;
      const dayPlans = report?.dayTypePlans as Array<Record<string, unknown>> | undefined;
      if (!dt || !bundle || !report || !dayPlans) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dati del piano mancanti." });
      }

      type Macros = { kcal: number; proteinG: number; fatG: number; carbsG: number };
      type SelectedMeal = {
        template?: { id?: string; name?: string };
        scaleFactor?: number;
        scaledIngredients?: Array<{ name: string; grams: number; foodId?: string }>;
        actualMacros?: Macros;
      };
      type Slot = { slot: string; targetMacros?: Macros; primary?: SelectedMeal; substitutions?: SelectedMeal[] };

      const dayIdx = dayPlans.findIndex((d) => d.dayType === input.dayType);
      if (dayIdx === -1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo giorno non trovato." });
      }
      const day = dayPlans[dayIdx] as Record<string, unknown>;
      const mealPlan = day.mealPlan as Record<string, unknown> | undefined;
      const slots = mealPlan?.slots as Slot[] | undefined;
      if (!slots) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pasti non disponibili." });
      }
      const slotIdx = slots.findIndex((s) => s.slot === input.slot);
      if (slotIdx === -1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Slot pasto non trovato." });
      }

      const slot = slots[slotIdx]!;
      const subs = slot.substitutions ?? [];
      const subIdx = subs.findIndex(
        (s) => s.template?.id === input.substitutionTemplateId
      );
      if (subIdx === -1 || !slot.primary) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Alternativa non trovata." });
      }

      // Swap in place: chosen sub → primary; old primary takes that sub's seat.
      const oldPrimary = slot.primary;
      const newPrimary = subs[subIdx]!;
      const newSubs = [...subs];
      newSubs[subIdx] = oldPrimary;
      const newSlots = [...slots];
      newSlots[slotIdx] = { ...slot, primary: newPrimary, substitutions: newSubs };

      // Recompute day-level macros + deviation + tolerance against targetMacros.
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const newActual: Macros = newSlots.reduce(
        (acc, s) => {
          const am = s.primary?.actualMacros;
          return {
            kcal: acc.kcal + (am?.kcal ?? 0),
            proteinG: r1(acc.proteinG + (am?.proteinG ?? 0)),
            fatG: r1(acc.fatG + (am?.fatG ?? 0)),
            carbsG: r1(acc.carbsG + (am?.carbsG ?? 0)),
          };
        },
        { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }
      );

      const planTarget = mealPlan?.targetMacros as Record<string, number> | undefined;
      const dayMacros = day.macros as Record<string, number> | undefined;
      const tgtKcal = (planTarget?.totalKcal as number) ?? (dayMacros?.totalKcal as number) ?? 0;
      const tgtProtein = (planTarget?.proteinG as number) ?? (dayMacros?.proteinG as number) ?? 0;
      const tgtFat = (planTarget?.fatG as number) ?? (dayMacros?.fatG as number) ?? 0;
      const tgtCarb =
        (planTarget?.carbG as number) ??
        (planTarget?.carbsG as number) ??
        (dayMacros?.carbG as number) ??
        0;

      const deviation = {
        kcal: newActual.kcal - tgtKcal,
        proteinG: r1(newActual.proteinG - tgtProtein),
        fatG: r1(newActual.fatG - tgtFat),
        carbsG: r1(newActual.carbsG - tgtCarb),
      };
      // Protected pair (kcal + protein) via the single relative-tolerance source
      // shared with the engine (reconcile.ts) — the flag agrees with convergence (#3).
      const withinTolerance = withinReconcileTolerance(deviation, tgtKcal, tgtProtein);

      const updatedMealPlan = {
        ...mealPlan,
        slots: newSlots,
        actualMacros: newActual,
        deviation,
        withinTolerance,
      };

      const updatedDayPlans = [...dayPlans];
      updatedDayPlans[dayIdx] = { ...day, mealPlan: updatedMealPlan };

      const mealPlansRecord = bundle.mealPlans as Record<string, unknown> | undefined;
      const updatedMealPlansRecord =
        mealPlansRecord && Object.prototype.hasOwnProperty.call(mealPlansRecord, input.dayType)
          ? { ...mealPlansRecord, [input.dayType]: updatedMealPlan }
          : mealPlansRecord;

      const updatedDt = {
        ...dt,
        plan_bundle: {
          ...bundle,
          ...(updatedMealPlansRecord ? { mealPlans: updatedMealPlansRecord } : {}),
          reportData: { ...report, dayTypePlans: updatedDayPlans },
        },
      };

      const { error } = await ctx.supabase
        .from("plan")
        .update({ daily_targets: updatedDt })
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId);
      if (error) {
        console.error("[router/plan.swapMealSelection]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio.",
        });
      }

      return {
        success: true,
        promotedName: newPrimary.template?.name ?? null,
        demotedName: oldPrimary.template?.name ?? null,
        withinTolerance,
      };
    }),

  /**
   * #20 — item-level food swap (coach). Replace ONE ingredient in a slot's
   * primary meal with a SAME-CATEGORY alternative; grams are recomputed
   * ITEM-LOCALLY to hold the swapped item's prior macro contribution (smaller
   * allowance — we do NOT re-solve the whole slot/day). Day totals + deviation +
   * tolerance are recomputed and the bundle is PATCHED IN PLACE (a coach
   * item-tweak is an edit, like saveEdits — NOT a new version).
   */
  swapMealItem: protectedProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        dayType: z.string(),
        slot: z.string(),
        ingredientIndex: z.number().int().min(0),
        newFoodId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: plan } = await ctx.supabase
        .from("plan")
        .select("id, daily_targets")
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Piano non trovato." });
      }

      const dt = plan.daily_targets as Record<string, unknown> | null;
      const bundle = dt?.plan_bundle as Record<string, unknown> | undefined;
      const report = bundle?.reportData as Record<string, unknown> | undefined;
      const dayPlans = report?.dayTypePlans as Array<Record<string, unknown>> | undefined;
      if (!dt || !bundle || !report || !dayPlans) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dati del piano mancanti." });
      }

      type Macros = { kcal: number; proteinG: number; fatG: number; carbsG: number; fibreG?: number; sodiumMg?: number };
      type Ingredient = { name: string; grams: number; foodId?: string };
      type SelectedMeal = {
        template?: { id?: string; name?: string };
        scaleFactor?: number;
        scaledIngredients?: Ingredient[];
        actualMacros?: Macros;
      };
      type Slot = { slot: string; targetMacros?: Macros; primary?: SelectedMeal; substitutions?: SelectedMeal[] };

      const dayIdx = dayPlans.findIndex((d) => d.dayType === input.dayType);
      if (dayIdx === -1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo giorno non trovato." });
      }
      const day = dayPlans[dayIdx] as Record<string, unknown>;
      const mealPlan = day.mealPlan as Record<string, unknown> | undefined;
      const slots = mealPlan?.slots as Slot[] | undefined;
      if (!slots) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pasti non disponibili." });
      }
      const slotIdx = slots.findIndex((s) => s.slot === input.slot);
      if (slotIdx === -1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Slot pasto non trovato." });
      }

      const slot = slots[slotIdx]!;
      const ings = slot.primary?.scaledIngredients;
      if (!slot.primary || !ings) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pasto principale non disponibile." });
      }
      const oldIng = ings[input.ingredientIndex];
      if (!oldIng || !oldIng.foodId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ingrediente non trovato." });
      }

      // Item-local recalc (validates FOOD_MAP + same-category; throws → 400).
      let swapped;
      try {
        swapped = recomputeSwappedIngredient(
          { foodId: oldIng.foodId, name: oldIng.name, grams: oldIng.grams },
          input.newFoodId
        );
      } catch (err) {
        const msg = err instanceof Error && /cross-category/.test(err.message)
          ? "L'alternativa deve essere della stessa categoria."
          : "Alimento alternativo non valido.";
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }

      // Rewrite just the swapped ingredient; recompute the slot's macros
      // item-locally from the full ingredient list (NOT a slot re-solve).
      const newIngredients: Ingredient[] = ings.map((ing, i) =>
        i === input.ingredientIndex ? { foodId: swapped.foodId, name: swapped.name, grams: swapped.grams } : ing
      );
      // Every solved ingredient carries a foodId; guard legacy bundles.
      if (newIngredients.some((ing) => !ing.foodId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ingredienti non ricalcolabili (foodId mancante)." });
      }
      const slotMacros = macrosFromIngredients(
        newIngredients.map((ing) => ({ foodId: ing.foodId!, name: ing.name, grams: ing.grams }))
      );
      const newPrimary: SelectedMeal = {
        ...slot.primary,
        scaledIngredients: newIngredients,
        actualMacros: {
          kcal: slotMacros.kcal,
          proteinG: slotMacros.proteinG,
          fatG: slotMacros.fatG,
          carbsG: slotMacros.carbsG,
          fibreG: slotMacros.fibreG,
          sodiumMg: slotMacros.sodiumMg,
        },
      };
      const newSlots = [...slots];
      newSlots[slotIdx] = { ...slot, primary: newPrimary };

      // Recompute day-level macros + deviation + tolerance (protected pair).
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const newActual: Macros = newSlots.reduce(
        (acc, s) => {
          const am = s.primary?.actualMacros;
          return {
            kcal: acc.kcal + (am?.kcal ?? 0),
            proteinG: r1(acc.proteinG + (am?.proteinG ?? 0)),
            fatG: r1(acc.fatG + (am?.fatG ?? 0)),
            carbsG: r1(acc.carbsG + (am?.carbsG ?? 0)),
          };
        },
        { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }
      );

      const planTarget = mealPlan?.targetMacros as Record<string, number> | undefined;
      const dayMacros = day.macros as Record<string, number> | undefined;
      const tgtKcal = (planTarget?.totalKcal as number) ?? (dayMacros?.totalKcal as number) ?? 0;
      const tgtProtein = (planTarget?.proteinG as number) ?? (dayMacros?.proteinG as number) ?? 0;
      const tgtFat = (planTarget?.fatG as number) ?? (dayMacros?.fatG as number) ?? 0;
      const tgtCarb =
        (planTarget?.carbG as number) ??
        (planTarget?.carbsG as number) ??
        (dayMacros?.carbG as number) ??
        0;

      const deviation = {
        kcal: newActual.kcal - tgtKcal,
        proteinG: r1(newActual.proteinG - tgtProtein),
        fatG: r1(newActual.fatG - tgtFat),
        carbsG: r1(newActual.carbsG - tgtCarb),
      };
      // Protected pair (kcal + protein) via the single relative-tolerance source
      // shared with the engine (reconcile.ts) — the flag agrees with convergence (#3).
      const withinTolerance = withinReconcileTolerance(deviation, tgtKcal, tgtProtein);

      const updatedMealPlan = {
        ...mealPlan,
        slots: newSlots,
        actualMacros: newActual,
        deviation,
        withinTolerance,
      };

      const updatedDayPlans = [...dayPlans];
      updatedDayPlans[dayIdx] = { ...day, mealPlan: updatedMealPlan };

      const mealPlansRecord = bundle.mealPlans as Record<string, unknown> | undefined;
      const updatedMealPlansRecord =
        mealPlansRecord && Object.prototype.hasOwnProperty.call(mealPlansRecord, input.dayType)
          ? { ...mealPlansRecord, [input.dayType]: updatedMealPlan }
          : mealPlansRecord;

      const updatedDt = {
        ...dt,
        plan_bundle: {
          ...bundle,
          ...(updatedMealPlansRecord ? { mealPlans: updatedMealPlansRecord } : {}),
          reportData: { ...report, dayTypePlans: updatedDayPlans },
        },
      };

      const { error } = await ctx.supabase
        .from("plan")
        .update({ daily_targets: updatedDt })
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId);
      if (error) {
        console.error("[router/plan.swapMealItem]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel salvataggio." });
      }

      return {
        success: true,
        oldFood: { foodId: oldIng.foodId, name: oldIng.name, grams: oldIng.grams },
        newFood: swapped,
        slot: input.slot,
        withinTolerance,
      };
    }),

  /**
   * Persist coach edits to a plan's supplements and/or guidance text.
   * The review UI mutates these locally; this writes them back into the plan
   * bundle (both the top-level fields and reportData) so they survive a reload
   * and flow through to the PDF.
   */
  saveEdits: protectedProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        // #23: item schema widened (notes/frequency/libraryId/isCustom) so the
        // Integratori library/custom fields persist instead of being stripped.
        supplements: z.array(supplementEditItemSchema).max(60).optional(),
        guidance: z
          .object({
            bodyCompAnalysis: z.string().max(20000),
            nutritionStrategy: z.string().max(20000),
            trainingNotes: z.string().max(20000),
            coachNotes: z.string().max(20000),
          })
          .partial()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: plan } = await ctx.supabase
        .from("plan")
        .select("id, daily_targets")
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Piano non trovato." });
      }

      const dt = plan.daily_targets as Record<string, unknown> | null;
      const bundle = dt?.plan_bundle as Record<string, unknown> | undefined;
      if (!dt || !bundle) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dati del piano mancanti." });
      }
      const report = (bundle.reportData as Record<string, unknown> | undefined) ?? {};

      const newSupplements =
        input.supplements ?? (bundle.supplements as unknown[]) ?? [];
      const existingGuidance = (bundle.guidance as Record<string, unknown> | undefined) ?? {};
      const newGuidance = input.guidance
        ? { ...existingGuidance, ...input.guidance }
        : existingGuidance;

      const updatedDt = {
        ...dt,
        plan_bundle: {
          ...bundle,
          supplements: newSupplements,
          guidance: newGuidance,
          reportData: {
            ...report,
            supplements: newSupplements,
            guidance: newGuidance,
          },
        },
      };

      const { error } = await ctx.supabase
        .from("plan")
        .update({ daily_targets: updatedDt })
        .eq("id", input.planId)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/plan.saveEdits]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel salvataggio." });
      }

      return { success: true };
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

      // 2b. Provision the client's portal auth account before emailing the link
      //     (#1) — otherwise a sent-but-never-invited client cannot sign in.
      try {
        await ensurePortalAuthUser(createSupabaseServiceRole(), {
          clientId: plan.client_id,
          email: recipientEmail,
        });
      } catch (err) {
        console.error("[router/plan.shareWithClient] provisioning:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella preparazione dell'accesso cliente. Riprova.",
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
${btnHtml(portalUrl("/login"), "Visualizza il piano")}
<p style="margin:20px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">
  Hai domande? Rispondi a questa email o contatta direttamente il tuo coach.
</p>`
      );

      // 5. Send via Resend
      try {
        await sendEmail({
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
   * #16b — pinnable food sources grouped by category, for the generate wizard's
   * source-swap dropdowns. Static catalogue (food DB), partner-gated.
   */
  foodCatalogue: protectedProcedure.query(() => {
    // Log-and-rethrow for observability parity with plan.generate: foodCatalogue
    // reads the bundled food DB and both 500'd opaquely during the CSV incident.
    // We don't swallow here (the error still surfaces), we just ensure it's tagged
    // in prod logs. Client sees tRPC's default safe 500; internals aren't leaked.
    try {
      return foodCatalogue();
    } catch (err) {
      console.error(
        "[router/plan.foodCatalogue] error:",
        err,
        err instanceof Error ? err.stack : ""
      );
      throw err;
    }
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
