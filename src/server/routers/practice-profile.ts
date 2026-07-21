/**
 * Practitioner practice-profile router (#29 completion).
 *
 * Roberto enters his practice details ONCE (Albo, P.IVA, studio, insurer, fee,
 * foro, terms…); every engagement letter auto-fills them via the {{merge tokens}}
 * that replaced the template's [PLACEHOLDER: …] markers. One row per partner in
 * partner_practice_profile (migration 015 — applied by James).
 *
 * Partner-scoped: reads/writes go through ctx.supabase (session client), and the
 * table's RLS (partner_id ∈ partners of auth.uid()) enforces that a partner can
 * only touch their OWN profile — a cross-partner row is invisible/unwritable.
 */
import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

/** The practitioner fields the engagement letter fills (see legal-templates MERGE_TOKENS). */
const PROFILE_FIELDS = [
  "professione",
  "albo_ordine",
  "albo_number",
  "partita_iva",
  "codice_fiscale",
  "studio_address",
  "delivery_mode",
  "plan_delivery_days",
  "cadenza",
  "fee_importo",
  "cassa_iva",
  "fee_articolazione",
  "payment_metodo",
  "payment_termine",
  "durata",
  "cancellation_notice_hours",
  "penale",
  "numero_polizza",
  "assicuratore",
  "foro",
] as const;

export type PracticeProfileField = (typeof PROFILE_FIELDS)[number];

/** Each field: optional free text (nullable). Empty → letter shows "[DA COMPLETARE: …]". */
const field = () => z.string().max(1000).nullish();
const updateSchema = z.object({
  professione: field(),
  albo_ordine: field(),
  albo_number: field(),
  partita_iva: field(),
  codice_fiscale: field(),
  studio_address: field(),
  delivery_mode: field(),
  plan_delivery_days: field(),
  cadenza: field(),
  fee_importo: field(),
  cassa_iva: field(),
  fee_articolazione: field(),
  payment_metodo: field(),
  payment_termine: field(),
  durata: field(),
  cancellation_notice_hours: field(),
  penale: field(),
  numero_polizza: field(),
  assicuratore: field(),
  foro: field(),
});

/** An all-null profile (returned when the partner hasn't saved one yet). */
function emptyProfile(): Record<PracticeProfileField, string | null> {
  return Object.fromEntries(PROFILE_FIELDS.map((f) => [f, null])) as Record<
    PracticeProfileField,
    string | null
  >;
}

export const practiceProfileRouter = router({
  /** The partner's own practice profile (all fields null if never saved). */
  getPracticeProfile: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("partner_practice_profile")
      .select(PROFILE_FIELDS.join(", "))
      .eq("partner_id", ctx.partnerId)
      .maybeSingle();

    if (error) {
      console.error("[router/practiceProfile.getPracticeProfile]", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel caricamento dei dati." });
    }

    // Merge over the all-null default so the shape is always complete.
    return { ...emptyProfile(), ...((data as Record<string, string | null> | null) ?? {}) };
  }),

  /** Upsert the partner's own practice profile (one row per partner). */
  updatePracticeProfile: protectedProcedure
    .input(updateSchema)
    .mutation(async ({ ctx, input }) => {
      // Normalise: undefined → unchanged is not supported by upsert, so store the
      // full field set; empty strings persist as null (renders as a clear gap).
      const row: Record<string, string | null> = {};
      for (const f of PROFILE_FIELDS) {
        const v = input[f];
        row[f] = typeof v === "string" && v.trim() !== "" ? v.trim() : null;
      }

      const { error } = await ctx.supabase
        .from("partner_practice_profile")
        .upsert(
          { partner_id: ctx.partnerId, ...row, updated_at: new Date().toISOString() },
          { onConflict: "partner_id" }
        );

      if (error) {
        console.error("[router/practiceProfile.updatePracticeProfile]", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Errore nel salvataggio. Riprova." });
      }

      return { success: true, ...row };
    }),
});
