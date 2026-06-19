/**
 * Client router — CRUD operations for nutrition clients.
 * Supports listing, search, filtering, creation, update, and archival.
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { createSupabaseServiceRole } from "../../lib/supabase/service";
import { sendEmail } from "../../lib/resend/client";
import { ensurePortalAuthUser } from "../../services/portal-auth";

/** Client status filter values */
const clientStatusSchema = z.enum(["active", "paused", "archived"]);

/** Resolve the public app URL for portal links. */
function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://app.robertoscrigna.it"
  );
}

/** Schema for creating a new client */
const createClientSchema = z.object({
  fullName: z.string().min(2).max(200),
  email: z.email().optional(),
  phone: z.string().max(30).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato data: YYYY-MM-DD").optional(),
  sex: z.enum(["male", "female"]).optional(),
  heightCm: z.number().min(50).max(280).optional(),
  codiceFiscale: z.string().max(20).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
});

/** Training session for a single day */
const trainingSessionSchema = z.object({
  modality: z.string().max(100),
  duration_min: z.number().min(1).max(480),
  rpe: z.number().min(1).max(10),
});

/** Schema for creating a client snapshot from the intake form */
const createSnapshotSchema = z.object({
  clientId: z.string().uuid(),

  // Basic measurements (page 1)
  weightKg: z.number().min(30).max(300).optional(),
  heightCm: z.number().min(50).max(280).optional(),

  // Circumferences (page 2)
  circumferences: z
    .object({
      chest: z.number().optional(),
      waist: z.number().optional(),
      abdomen: z.number().optional(),
      hips: z.number().optional(),
      arm_r: z.number().optional(),
      arm_l: z.number().optional(),
      thigh_r: z.number().optional(),
      thigh_l: z.number().optional(),
    })
    .optional(),

  // Skinfolds / pliche (page 3)
  skinfolds: z
    .object({
      triceps: z.number().optional(),
      chest: z.number().optional(),
      abdomen: z.number().optional(),
      suprailiac: z.number().optional(),
      subscapular: z.number().optional(),
      thigh: z.number().optional(),
      midaxillary: z.number().optional(),
    })
    .optional(),

  // Medical history (page 4)
  medicalHistory: z
    .object({
      pathologies: z.string().optional(),
      family_history: z.string().optional(),
      allergies: z.string().optional(),
      intolerances: z.string().optional(),
      medications: z.string().optional(),
      supplements: z.string().optional(),
      digestion_issues: z.string().optional(),
      intestine_issues: z.string().optional(),
      sleep: z.string().optional(),
      nutritional_history: z.string().optional(),
    })
    .optional(),

  // Training (page 5) — per-day sessions indexed Mon(0)–Sun(6)
  trainingSessions: z
    .record(z.string(), z.array(trainingSessionSchema))
    .optional(),

  // Lifestyle (page 6)
  // occupationalLevel drives NEAT calculation in the engine — required for plan
  // generation. Falls back to "sedentary" in buildEngineSnapshot if absent.
  occupationalLevel: z
    .enum(["sedentary", "light", "moderate", "heavy", "very_heavy"])
    .optional(),

  lifestyle: z
    .object({
      daily_steps: z.number().min(0).max(200000).optional(),
      occupation: z.string().max(200).optional(),
      hunger_timing: z.string().max(500).optional(),
      meal_count: z.number().min(1).max(10).optional(),
      preferred_training_time: z.string().max(200).optional(),
    })
    .optional(),

  // Goal (page 7)
  goal: z
    .object({
      goal: z
        .enum(["fat_loss", "muscle_gain", "maintenance", "performance"])
        .optional(),
      target_weight_kg: z.number().optional(),
      target_event: z.string().max(500).optional(),
      target_event_date: z.string().optional(),
    })
    .optional(),
});

/** Schema for updating a client */
const updateClientSchema = createClientSchema.partial().extend({
  id: z.string().uuid(),
  status: clientStatusSchema.optional(),
});

/** Schema for the 7-page intake form */
const intakeFormSchema = z.object({
  // Page 1: Dati Anagrafici (Personal Data)
  fullName: z.string().min(2).max(200),
  email: z.email().optional(),
  phone: z.string().max(30).optional(),
  dateOfBirth: z.string(), // ISO date
  sex: z.enum(["male", "female"]),

  // Page 2: Misurazioni (Measurements)
  weightKg: z.number().min(30).max(300),
  heightCm: z.number().min(100).max(250),
  dailySteps: z.number().min(0).max(100000),
  occupationalLevel: z.enum([
    "sedentary",
    "light",
    "moderate",
    "heavy",
    "very_heavy",
  ]),

  // Page 3: Plicometria (Skinfold)
  skinfoldData: z
    .object({
      method: z.enum(["7site", "3site", "override"]),
      chest: z.number().optional(),
      midaxillary: z.number().optional(),
      tricep: z.number().optional(),
      subscapular: z.number().optional(),
      abdominal: z.number().optional(),
      suprailiac: z.number().optional(),
      thigh: z.number().optional(),
      bodyFatPctOverride: z.number().min(3).max(60).optional(),
    })
    .optional(),

  // Page 4: Anamnesi (Medical History)
  medicalHistory: z
    .object({
      conditions: z.array(z.string()).optional(),
      medications: z.array(z.string()).optional(),
      allergies: z.array(z.string()).optional(),
      intolerances: z.array(z.string()).optional(),
      familyHistory: z.string().optional(),
    })
    .optional(),

  // Page 5: Allenamento (Training)
  trainingInfo: z
    .object({
      weekSchedule: z.array(
        z.enum(["training", "rest", "refeed", "deload"])
      ).length(7),
      trainingType: z.string().optional(),
      trainingFrequency: z.number().min(0).max(7).optional(),
      trainingDuration: z.number().min(0).max(300).optional(),
      exerciseMethod: z
        .enum([
          "heart_rate",
          "met_value",
          "session_estimate",
          "default_estimate",
        ])
        .optional(),
      avgHeartRate: z.number().optional(),
      metValue: z.number().optional(),
      kcalEstimate: z.number().optional(),
    })
    .optional(),

  // Page 6: Stile di Vita (Lifestyle)
  lifestyle: z
    .object({
      sleepHours: z.number().min(3).max(14).optional(),
      stressLevel: z.number().min(1).max(10).optional(),
      waterIntakeMl: z.number().min(0).max(10000).optional(),
      alcoholFrequency: z
        .enum(["never", "rare", "weekly", "daily"])
        .optional(),
      mealPreferences: z.array(z.string()).optional(),
      cookingAbility: z
        .enum(["none", "basic", "intermediate", "advanced"])
        .optional(),
    })
    .optional(),

  // Page 7: Obiettivo (Goal)
  goal: z
    .object({
      primaryGoal: z
        .enum([
          "weight_loss",
          "muscle_gain",
          "recomposition",
          "maintenance",
          "performance",
        ])
        .optional(),
      targetWeightKg: z.number().optional(),
      timeline: z.string().optional(),
      motivation: z.string().max(2000).optional(),
      previousDiets: z.string().max(2000).optional(),
    })
    .optional(),
});

export const clientRouter = router({
  /**
   * List all clients for the current partner.
   * Supports filtering by status, search by name/email, and pagination.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          status: clientStatusSchema.optional(),
          search: z.string().max(200).optional(),
          limit: z.number().min(1).max(100).optional(),
          offset: z.number().min(0).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      let query = ctx.supabase
        .from("client")
        .select("id, full_name, email, phone, sex, status, tags, created_at", {
          count: "exact",
        })
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (input?.status) {
        query = query.eq("status", input.status);
      }

      if (input?.search) {
        const escaped = input.search.replace(/[%_]/g, "\\$&");
        query = query.or(
          `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`
        );
      }

      const { data, count, error } = await query;

      if (error) {
        console.error("[router/client.list]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel caricamento dei dati.",
        });
      }

      return { clients: data ?? [], total: count ?? 0 };
    }),

  /**
   * Get a single client by ID with latest snapshot.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: client, error } = await ctx.supabase
        .from("client")
        .select("*")
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (error || !client) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cliente non trovato.",
        });
      }

      // Get latest snapshot
      const { data: snapshot } = await ctx.supabase
        .from("client_snapshot")
        .select("*")
        .eq("client_id", input.id)
        .order("taken_at", { ascending: false })
        .limit(1)
        .single();

      return { client, latestSnapshot: snapshot };
    }),

  /**
   * Create a new client with basic info.
   * heightCm is stored separately via createSnapshot; codiceFiscale appended to notes.
   */
  create: protectedProcedure
    .input(createClientSchema)
    .mutation(async ({ ctx, input }) => {
      // Compose notes: prepend codice fiscale if provided
      const noteParts: string[] = [];
      if (input.codiceFiscale) {
        noteParts.push(`Codice Fiscale: ${input.codiceFiscale}`);
      }
      if (input.notes) {
        noteParts.push(input.notes);
      }

      const { data, error } = await ctx.supabase
        .from("client")
        .insert({
          partner_id: ctx.partnerId,
          full_name: input.fullName,
          email: input.email,
          phone: input.phone,
          date_of_birth: input.dateOfBirth,
          sex: input.sex,
          notes: noteParts.length > 0 ? noteParts.join("\n") : null,
          tags: input.tags ?? [],
        })
        .select("id, full_name, email, status")
        .single();

      if (error) {
        console.error("[router/client.create]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio. Riprova tra poco.",
        });
      }

      return data;
    }),

  /**
   * Create an initial snapshot for a newly created client from the intake form.
   * Stores all extended measurement/lifestyle/goal data in skinfold_data JSONB
   * and week_schedule for training day classification.
   */
  createSnapshot: protectedProcedure
    .input(createSnapshotSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify the client belongs to this partner
      const { data: clientCheck, error: checkError } = await ctx.supabase
        .from("client")
        .select("id, date_of_birth")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (checkError || !clientCheck) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cliente non trovato.",
        });
      }

      // Calculate age from date_of_birth if available
      let ageYears: number | null = null;
      if (clientCheck.date_of_birth) {
        const birth = new Date(clientCheck.date_of_birth as string);
        ageYears = Math.floor(
          (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        );
      }

      // Build week_schedule (7 elements: Mon–Sun)
      // Derive from training sessions: days with sessions = "training", rest = "rest"
      const weekSchedule: string[] = Array(7).fill("rest");
      if (input.trainingSessions) {
        for (let i = 0; i < 7; i++) {
          const sessions = input.trainingSessions[String(i)];
          if (sessions && sessions.length > 0) {
            weekSchedule[i] = "training";
          }
        }
      }

      // Determine body fat method and build an engine-readable skinfold_data object.
      // buildEngineSnapshot (plan.ts) reads skinfold_data.method to pick the
      // right formula. We nest the raw intake skinfolds under an "intake_raw"
      // key so the engine keys (chest, midaxillary, tricep, …) can be mapped.
      let bodyFatMethod: string | null = null;
      let engineSkinfoldData: Record<string, unknown> | null = null;

      if (input.skinfolds) {
        const filledSites = Object.values(input.skinfolds).filter(
          (v) => v != null && v > 0
        ).length;

        if (filledSites >= 7) {
          bodyFatMethod = "7site";
          // Map intake field names → engine field names
          engineSkinfoldData = {
            method: "7site",
            chest: input.skinfolds.chest,
            midaxillary: input.skinfolds.midaxillary,
            tricep: input.skinfolds.triceps,
            subscapular: input.skinfolds.subscapular,
            abdominal: input.skinfolds.abdomen,
            suprailiac: input.skinfolds.suprailiac,
            thigh: input.skinfolds.thigh,
          };
        } else if (filledSites >= 3) {
          bodyFatMethod = "3site";
          engineSkinfoldData = {
            method: "3site",
            chest: input.skinfolds.chest,
            abdominal: input.skinfolds.abdomen,
            thigh: input.skinfolds.thigh,
            // Female 3-site uses tricep + suprailiac + thigh
            tricep: input.skinfolds.triceps,
            suprailiac: input.skinfolds.suprailiac,
          };
        }
      }

      // Pack ALL extended intake data into skinfold_data JSONB so nothing is lost.
      // The engine reads top-level "method" + measurement keys; other keys are ignored.
      const skinfoldDataPayload: Record<string, unknown> = {
        // Engine-readable fields (method + measurements at top level)
        ...(engineSkinfoldData ?? {}),
        // Extended intake data preserved for audit / future use
        _intake: {
          circumferences: input.circumferences ?? null,
          skinfolds: input.skinfolds ?? null,
          medical_history: input.medicalHistory ?? null,
          training_sessions: input.trainingSessions ?? null,
          lifestyle: input.lifestyle ?? null,
          goal: input.goal ?? null,
        },
      };

      // Build notes text from medical history for readability
      const noteLines: string[] = [];
      if (input.medicalHistory?.pathologies) {
        noteLines.push(`Patologie: ${input.medicalHistory.pathologies}`);
      }
      if (input.goal?.goal) {
        const goalLabels: Record<string, string> = {
          fat_loss: "Dimagrimento",
          muscle_gain: "Aumento Massa",
          maintenance: "Mantenimento",
          performance: "Performance",
        };
        noteLines.push(
          `Obiettivo: ${goalLabels[input.goal.goal] ?? input.goal.goal}`
        );
      }
      if (input.goal?.target_weight_kg) {
        noteLines.push(`Peso target: ${input.goal.target_weight_kg} kg`);
      }

      const { data: snapshot, error: snapshotError } = await ctx.supabase
        .from("client_snapshot")
        .insert({
          client_id: input.clientId,
          weight_kg: input.weightKg ?? null,
          height_cm: input.heightCm ?? null,
          age_years: ageYears,
          daily_steps: input.lifestyle?.daily_steps ?? null,
          // occupational_level is consumed by buildEngineSnapshot to compute NEAT
          occupational_level: input.occupationalLevel ?? null,
          week_schedule: weekSchedule,
          skinfold_data: skinfoldDataPayload,
          body_fat_method: bodyFatMethod,
          notes: noteLines.length > 0 ? noteLines.join("\n") : null,
        })
        .select("id")
        .single();

      if (snapshotError) {
        console.error("[router/client.createSnapshot]", snapshotError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio. Riprova tra poco.",
        });
      }

      return { snapshotId: snapshot?.id };
    }),

  /**
   * Update an existing client.
   */
  update: protectedProcedure
    .input(updateClientSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const updateData: Record<string, unknown> = {};
      if (updates.fullName !== undefined)
        updateData.full_name = updates.fullName;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.phone !== undefined) updateData.phone = updates.phone;
      if (updates.dateOfBirth !== undefined)
        updateData.date_of_birth = updates.dateOfBirth;
      if (updates.sex !== undefined) updateData.sex = updates.sex;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.tags !== undefined) updateData.tags = updates.tags;

      const { data, error } = await ctx.supabase
        .from("client")
        .update(updateData)
        .eq("id", id)
        .eq("partner_id", ctx.partnerId)
        .select("id, full_name, email, status")
        .single();

      if (error) {
        console.error("[router/client.update]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nell'aggiornamento. Riprova.",
        });
      }

      return data;
    }),

  /**
   * List all snapshots for a client ordered by most recent first.
   * Scoped to the current partner via RLS (uses ctx.supabase, not service role).
   */
  listSnapshots: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify client belongs to this partner before returning snapshots
      const { data: clientCheck, error: clientError } = await ctx.supabase
        .from("client")
        .select("id")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();

      if (clientError || !clientCheck) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cliente non trovato.",
        });
      }

      const { data, error } = await ctx.supabase
        .from("client_snapshot")
        .select(
          "id, taken_at, weight_kg, height_cm, body_fat_pct, body_fat_method, lean_mass_kg, fat_mass_kg, daily_steps, bmr_kcal"
        )
        .eq("client_id", input.clientId)
        .order("taken_at", { ascending: false });

      if (error) {
        console.error("[router/client.listSnapshots]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel caricamento degli snapshot.",
        });
      }

      return data ?? [];
    }),

  /**
   * Invite a client to the client portal.
   *
   * Ensures a Supabase auth user exists for the client's email, links it to the
   * client row (client.auth_user_id), then emails the client a link to the
   * portal login page. The login page uses passwordless magic-link sign-in
   * (`shouldCreateUser: false`), so the account must already exist — which this
   * procedure guarantees.
   *
   * Requires SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY and NEXT_PUBLIC_APP_URL
   * to be configured in the environment.
   */
  sendPortalInvite: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify ownership and gather what we need
      const { data: client } = await ctx.supabase
        .from("client")
        .select("id, full_name, email, status, auth_user_id")
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
          message: "Aggiungi un indirizzo email al cliente prima di invitarlo al portale.",
        });
      }
      if (client.status === "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Il cliente è archiviato. Riattivalo prima di invitarlo.",
        });
      }

      const email = client.email.trim().toLowerCase();

      // 2. Ensure an auth user exists for this email and is linked to the
      //    client row (idempotent). Shared with the plan-send paths (#1).
      try {
        await ensurePortalAuthUser(createSupabaseServiceRole(), {
          clientId: input.clientId,
          email,
        });
      } catch (err) {
        console.error("[router/client.sendPortalInvite] provisioning:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella creazione dell'accesso cliente. Riprova.",
        });
      }

      // 3. Email the portal login link.
      const loginUrl = `${appBaseUrl()}/portal/login`;
      const firstName = client.full_name?.split(" ")[0] ?? "";
      const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#1a1a2e;padding:24px 32px;"><p style="margin:0;font-size:13px;color:#9ca3af;">Roberto Scrigna — Nutrizione Sportiva</p></td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Accesso al tuo portale${firstName ? `, ${firstName}` : ""}</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
            Il tuo coach ti ha attivato l'accesso all'area cliente, dove potrai consultare il tuo piano nutrizionale, gli integratori e inviare i check-in.
          </p>
          <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
            Accedi qui sotto: ti basterà inserire questo indirizzo email (<strong>${email}</strong>) e riceverai un link per entrare senza password.
          </p>
          <a href="${loginUrl}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-top:20px;">Accedi al portale</a>
          <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">Se non ti aspettavi questa email, puoi ignorarla.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #f1f5f9;"><p style="margin:0;font-size:11px;color:#d1d5db;text-align:center;">Roberto Scrigna — Nutrizione Sportiva · Portale Clienti</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      try {
        await sendEmail({
          to: email,
          subject: "Accesso al tuo portale nutrizionale — Roberto Scrigna",
          html,
        });
      } catch (err) {
        console.error("[router/client.sendPortalInvite] Resend error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Account collegato, ma invio dell'email non riuscito. Riprova tra poco.",
        });
      }

      return { success: true, sentTo: email, loginUrl };
    }),

  /**
   * Soft-delete (archive) a client.
   */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("client")
        .update({
          status: "archived",
          deleted_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("partner_id", ctx.partnerId);

      if (error) {
        console.error("[router/client.archive]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nell'eliminazione. Riprova.",
        });
      }

      return { success: true };
    }),

  /**
   * Submit the 7-page intake form.
   * Creates a new client and initial snapshot in one operation.
   */
  submitIntakeForm: protectedProcedure
    .input(intakeFormSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Create the client record
      const { data: client, error: clientError } = await ctx.supabase
        .from("client")
        .insert({
          partner_id: ctx.partnerId,
          full_name: input.fullName,
          email: input.email,
          phone: input.phone,
          date_of_birth: input.dateOfBirth,
          sex: input.sex,
          notes: [
            input.medicalHistory
              ? `Anamnesi: ${JSON.stringify(input.medicalHistory)}`
              : null,
            input.lifestyle
              ? `Stile di vita: ${JSON.stringify(input.lifestyle)}`
              : null,
            input.goal
              ? `Obiettivo: ${JSON.stringify(input.goal)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
        })
        .select("id")
        .single();

      if (clientError || !client) {
        console.error("[router/client.submitIntakeForm] client insert:", clientError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella creazione del cliente.",
        });
      }

      // 2. Create the initial snapshot
      const birthDate = new Date(input.dateOfBirth);
      const ageYears = Math.floor(
        (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );

      const { data: snapshot, error: snapshotError } = await ctx.supabase
        .from("client_snapshot")
        .insert({
          client_id: client.id,
          weight_kg: input.weightKg,
          height_cm: input.heightCm,
          age_years: ageYears,
          daily_steps: input.dailySteps,
          occupational_level: input.occupationalLevel,
          skinfold_data: input.skinfoldData
            ? JSON.stringify(input.skinfoldData)
            : null,
          week_schedule: input.trainingInfo?.weekSchedule ?? [
            "training",
            "rest",
            "training",
            "rest",
            "training",
            "rest",
            "rest",
          ],
        })
        .select("id")
        .single();

      if (snapshotError) {
        console.error("[router/client.submitIntakeForm]", snapshotError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel salvataggio. Riprova tra poco.",
        });
      }

      return { clientId: client.id, snapshotId: snapshot?.id };
    }),
});
