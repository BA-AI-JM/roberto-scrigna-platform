/**
 * Signature Router — in-app SES signing behind the EsignProvider seam (Req #29).
 *
 * The router NEVER hardcodes a provider — it resolves the active one through
 * getSignatureProvider() and calls the interface. Internal SES acceptance
 * (pending -> signed) is performed here (client-scoped, internal-only); external
 * providers sign on their hosted page and signal via webhook.
 *
 * Procedures:
 * - createSignatureRequest   (partner) create a request for a client's active letter
 * - getMyPendingSignatures   (client)  the client's open requests
 * - getSignatureRequest      (client)  read one of the client's own requests
 * - acceptSignature          (client)  internal SES: accept -> signed (+ stamps)
 * - getSignatureStatus       (client)  provider status for an own request
 * - downloadSignedDocument   (client)  regenerated signed PDF (base64) for an own request
 *
 * Data access uses the service-role client (like the portal router), scoped
 * manually by ctx.partnerId / ctx.clientId; the RLS policies in migration 010
 * are defence-in-depth.
 */

import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, clientProcedure } from "../trpc";
import { createSupabaseServiceRole } from "../../lib/supabase/service";
import { getSignatureProvider, activeSignatureProviderName } from "../esign/factory";
import { renderSignedEngagementLetterPdf } from "../signature-document";
import type { SignatureProviderDeps } from "../esign/types";

const OPEN_STATUSES = ["pending", "sent", "viewed"] as const;

/** Build the provider deps (service-role db + on-demand signed-PDF renderer). */
function buildDeps(): SignatureProviderDeps {
  const db = createSupabaseServiceRole();
  return { db, renderSignedLetterPdf: (id: string) => renderSignedEngagementLetterPdf(db, id) };
}

export const signatureRouter = router({
  /**
   * Create a signature request for a client using the partner's active letter
   * version. Goes through the active provider (internal SES by default).
   */
  createSignatureRequest: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deps = buildDeps();
      const db = deps.db;

      const { data: client, error: clientErr } = await db
        .from("client")
        .select("id, full_name, email")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();
      if (clientErr || !client) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      const { data: doc } = await db
        .from("legal_document")
        .select("id, name")
        .eq("partner_id", ctx.partnerId)
        .eq("doc_kind", "engagement_letter")
        .maybeSingle();
      const version = doc?.id
        ? (
            await db
              .from("legal_document_version")
              .select("id, version_label, language")
              .eq("legal_document_id", doc.id)
              .eq("status", "active")
              .maybeSingle()
          ).data
        : null;
      if (!doc?.id || !version?.id) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Nessun modello di lettera attivo. Pubblica prima un modello (legal.seedDefaultEngagementLetter / createVersion).",
        });
      }

      const provider = getSignatureProvider(deps);
      const result = await provider.createSignatureRequest({
        clientId: client.id as string,
        partnerId: ctx.partnerId,
        documentVersionId: version.id as string,
        title: doc.name as string,
        language: version.language as string,
        signer: {
          fullName: client.full_name as string,
          email: (client.email as string | null) ?? "",
        },
      });

      return {
        requestId: result.providerRequestId,
        status: result.status,
        signingUrl: result.signingUrl ?? null,
        provider: provider.name,
      };
    }),

  /** The client's open (not-yet-signed) signature requests. */
  getMyPendingSignatures: clientProcedure.query(async ({ ctx }) => {
    const db = createSupabaseServiceRole();
    const { data, error } = await db
      .from("signature_request")
      .select("id, document_version_id, provider, status, created_at")
      .eq("client_id", ctx.clientId)
      .in("status", OPEN_STATUSES as unknown as string[])
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[router/signature.getMyPendingSignatures]", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Errore nel recupero delle firme.",
      });
    }
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      documentVersionId: r.document_version_id as string,
      provider: r.provider as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    }));
  }),

  /** Read one of the client's own requests. */
  getSignatureRequest: clientProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = createSupabaseServiceRole();
      const { data, error } = await db
        .from("signature_request")
        .select(
          "id, document_version_id, provider, status, accepted_at, acceptance_method, created_at"
        )
        .eq("id", input.requestId)
        .eq("client_id", ctx.clientId)
        .single();
      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Richiesta non trovata." });
      }
      return data;
    }),

  /**
   * Internal SES acceptance: flip the client's own pending request to 'signed'
   * and stamp who/when/method. Only valid when the active provider is internal —
   * external providers handle signing themselves.
   */
  acceptSignature: clientProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (activeSignatureProviderName() !== "internal") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "L'accettazione in-app è disponibile solo con il provider di firma interno.",
        });
      }
      const db = createSupabaseServiceRole();

      const { data: req, error: reqErr } = await db
        .from("signature_request")
        .select("id, status")
        .eq("id", input.requestId)
        .eq("client_id", ctx.clientId)
        .single();
      if (reqErr || !req) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Richiesta non trovata." });
      }
      if (req.status === "signed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Documento già firmato.",
        });
      }
      if (!(OPEN_STATUSES as readonly string[]).includes(req.status as string)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Questa richiesta non è firmabile.",
        });
      }

      const acceptedAt = new Date().toISOString();
      const { data: updated, error: upErr } = await db
        .from("signature_request")
        .update({
          status: "signed",
          accepted_at: acceptedAt,
          accepted_by: ctx.userId,
          acceptance_method: "in_app_ses",
        })
        .eq("id", req.id)
        .eq("client_id", ctx.clientId)
        .select("id, status, accepted_at")
        .single();
      if (upErr || !updated) {
        console.error("[router/signature.acceptSignature]", upErr);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nella registrazione della firma.",
        });
      }

      return {
        requestId: req.id as string,
        status: "signed" as const,
        acceptedAt,
        acceptanceMethod: "in_app_ses" as const,
      };
    }),

  /** Provider status for one of the client's own requests. */
  getSignatureStatus: clientProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const deps = buildDeps();
      const { data: own } = await deps.db
        .from("signature_request")
        .select("id")
        .eq("id", input.requestId)
        .eq("client_id", ctx.clientId)
        .maybeSingle();
      if (!own?.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Richiesta non trovata." });
      }
      return getSignatureProvider(deps).getStatus(input.requestId);
    }),

  /** Regenerated signed PDF (base64) for one of the client's own signed requests. */
  downloadSignedDocument: clientProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deps = buildDeps();
      const { data: own } = await deps.db
        .from("signature_request")
        .select("id, status")
        .eq("id", input.requestId)
        .eq("client_id", ctx.clientId)
        .maybeSingle();
      if (!own?.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Richiesta non trovata." });
      }
      if (own.status !== "signed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Documento non ancora firmato.",
        });
      }
      const doc = await getSignatureProvider(deps).downloadSignedDocument(input.requestId);
      return {
        pdfBase64: Buffer.from(doc.bytes).toString("base64"),
        mimeType: doc.contentType,
        filename: `lettera-firmata-${input.requestId}.pdf`,
      };
    }),
});
