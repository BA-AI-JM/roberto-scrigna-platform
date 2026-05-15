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
import { inngest } from "../../lib/inngest/client";
import {
  generatePlan,
  serializePlanResult,
} from "../../services/plan-generator";
import type { PlanGenerationInput } from "../../services/plan-generator";
import type { ClientSnapshot, DayType } from "../../engine/types";
import type { PdfClientInfo } from "../../pdf/types";
import { getResend, FROM_EMAIL } from "../../lib/resend/client";
import { DEFAULT_TOLERANCES } from "../../engine/meal-plan/types";
import {
  buildTrainingSessionFromIntake,
  type IntakeTrainingSession,
} from "../../services/training-modality";
import { roundGrams } from "../../engine/meal-plan/rounding";

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
              <p style="margin:0;font-size:13px;color:#9ca3af;">Roberto Scrigna — Nutrizione Sportiva</p>
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

const generatePlanSchema = z.object({
  clientId: z.string().uuid(),
  mealCount: z.number().min(3).max(6).optional().default(4),
  excludeAllergens: z.array(z.string()).optional(),
  preferTags: z.array(z.string()).optional(),
  maintenanceKcalEstimate: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pull the per-day training sessions captured at intake (stored under
 * skinfold_data._intake.training_sessions) out of a client_snapshot row.
 */
function intakeTrainingSessions(
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
function buildEngineSnapshot(
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

      // 3. Build engine snapshot
      const clientSex: "male" | "female" =
        (client.sex as "male" | "female") ?? "male";
      const snapshotRecord = snapshotRow as unknown as Record<string, unknown>;
      const snapshot = buildEngineSnapshot(snapshotRecord, clientSex);

      // 3b. Derive a per-training-day exercise session from the intake schedule
      // (falls back to the engine default when no training data is present).
      const trainingSession = buildTrainingSessionFromIntake(
        intakeTrainingSessions(snapshotRecord),
        snapshot.weekSchedule
      );

      // 4. Build client info for PDF cover
      const planDate = new Date().toISOString().split("T")[0]!;
      const clientInfo: PdfClientInfo = {
        fullName: client.full_name,
        email: client.email ?? undefined,
        phone: client.phone ?? undefined,
        dateOfBirth: client.date_of_birth ?? undefined,
        planDate,
      };

      // 5. Build generation input
      const genInput: PlanGenerationInput = {
        clientInfo,
        snapshot,
        mealCount: input.mealCount,
        excludeAllergens: input.excludeAllergens as PlanGenerationInput["excludeAllergens"],
        preferTags: input.preferTags as PlanGenerationInput["preferTags"],
        maintenanceKcalEstimate: input.maintenanceKcalEstimate,
        ...(trainingSession ? { engineOptions: { trainingSession } } : {}),
      };

      // 6. Run the pipeline (pure, synchronous)
      let result;
      try {
        result = generatePlan(genInput);
      } catch (err) {
        // Log the full engine error server-side; surface a safe message to the client.
        console.error("[router/plan.generate] engine error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella generazione del piano. Verifica che tutti i dati del cliente siano completi.",
        });
      }

      const serialized = serializePlanResult(result);

      // 7. Derive the macro payload summary for quick display in the list view
      const uniqueDayTypes = [...new Set(snapshot.weekSchedule)];
      const macroPayload: Record<string, unknown> = {
        weeklyAverageKcal: result.weeklyPlan.weeklyAverageKcal,
        weeklyAverageProteinG: result.weeklyPlan.weeklyAverageProteinG,
        dayTypes: uniqueDayTypes,
        energyBalance: result.energyBalance,
      };

      // 8. Persist plan to DB
      // plan_bundle and macro_payload are stored in daily_targets JSONB for now
      // (the schema already has daily_targets JSONB; we overload it to carry the
      //  full serialized result to avoid a migration while still being queryable).
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
            macro_payload: macroPayload,
            plan_bundle: serialized,
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
        weeklyAverageKcal: result.weeklyPlan.weeklyAverageKcal,
        energyBalance: result.energyBalance,
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
          "id, name, status, created_at, client_id, daily_targets, notes, meals_per_day"
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
        .select("id, client_id, daily_targets")
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

      const { error } = await ctx.supabase
        .from("plan")
        .update({ status: "active" })
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

      const scale = targetKcal / actualKcal;
      const r1 = (n: number) => Math.round(n * 10) / 10;

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

      const adjustedSlots: Slot[] = slots.map((slot) => ({
        ...slot,
        primary: scaleMeal(slot.primary),
        substitutions: slot.substitutions?.map((sub) => scaleMeal(sub)) as SelectedMeal[] | undefined,
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
      const withinTolerance =
        Math.abs(deviation.kcal) <= DEFAULT_TOLERANCES.kcal &&
        Math.abs(deviation.proteinG) <= DEFAULT_TOLERANCES.proteinG &&
        Math.abs(deviation.fatG) <= DEFAULT_TOLERANCES.fatG &&
        Math.abs(deviation.carbsG) <= DEFAULT_TOLERANCES.carbsG;

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
        previousKcal: Math.round(actualKcal),
        newKcal: newActual.kcal,
        scaleFactor: scale,
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
      const withinTolerance =
        Math.abs(deviation.kcal) <= DEFAULT_TOLERANCES.kcal &&
        Math.abs(deviation.proteinG) <= DEFAULT_TOLERANCES.proteinG &&
        Math.abs(deviation.fatG) <= DEFAULT_TOLERANCES.fatG &&
        Math.abs(deviation.carbsG) <= DEFAULT_TOLERANCES.carbsG;

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
   * Persist coach edits to a plan's supplements and/or guidance text.
   * The review UI mutates these locally; this writes them back into the plan
   * bundle (both the top-level fields and reportData) so they survive a reload
   * and flow through to the PDF.
   */
  saveEdits: protectedProcedure
    .input(
      z.object({
        planId: z.string().uuid(),
        supplements: z
          .array(
            z.object({
              name: z.string().max(200),
              dosage: z.string().max(200),
              timing: z.string().max(500),
              rationale: z.string().max(2000).optional(),
            })
          )
          .max(60)
          .optional(),
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
${btnHtml(portalUrl("/dashboard"), "Visualizza il piano")}
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
  Hai domande? Rispondi a questa email o contatta direttamente il tuo coach.
</p>`
      );

      // 5. Send via Resend
      try {
        await getResend().emails.send({
          from: FROM_EMAIL,
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
