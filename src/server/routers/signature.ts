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
import { fillEngagementLetter } from "../legal-letter";
import type { SignatureProviderDeps } from "../esign/types";

const OPEN_STATUSES = ["pending", "sent", "viewed"] as const;

/** Build the provider deps (service-role db + on-demand signed-PDF renderer). */
function buildDeps(): SignatureProviderDeps {
  const db = createSupabaseServiceRole();
  return { db, renderSignedLetterPdf: (id: string) => renderSignedEngagementLetterPdf(db, id) };
}

/**
 * Resolve the signed PDF for a request → { pdfBase64, mimeType, filename }.
 * Shared by the client (downloadSignedDocument) and coach (downloadSignedForClient)
 * downloads so both regenerate the SAME artifact. The caller MUST authorise the
 * request first (client- or partner-scoped) and ensure it is signed.
 */
async function resolveSignedPdf(deps: SignatureProviderDeps, requestId: string) {
  const doc = await getSignatureProvider(deps).downloadSignedDocument(requestId);
  return {
    pdfBase64: Buffer.from(doc.bytes).toString("base64"),
    mimeType: doc.contentType,
    filename: `lettera-firmata-${requestId}.pdf`,
  };
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
   * The engagement-letter document for one of the client's OWN requests, readable
   * BEFORE signing (returned regardless of status — that's the point: the in-app
   * SES screen shows it pre-sign). Returns the per-client filled BODY (markdown)
   * for display, NOT a PDF (the signed PDF is downloadSignedDocument, post-sign).
   * Reuses the shared fillEngagementLetter helper — no duplicated placeholder logic.
   * The contentHash is the version the request points at (frozen — a newer
   * published version does not change an existing request's document).
   */
  getSignatureDocument: clientProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = createSupabaseServiceRole();

      // Scope strictly to the caller; NO status filter (readable pre-sign).
      const { data: req, error: reqErr } = await db
        .from("signature_request")
        .select("id, status, document_version_id, partner_id")
        .eq("id", input.requestId)
        .eq("client_id", ctx.clientId)
        .single();
      if (reqErr || !req) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Richiesta non trovata." });
      }

      const { data: version, error: verErr } = await db
        .from("legal_document_version")
        .select(
          "legal_document_id, version_number, version_label, language, body_md, content_hash"
        )
        .eq("id", req.document_version_id)
        .single();
      if (verErr || !version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento non trovato." });
      }

      const { data: docRow } = await db
        .from("legal_document")
        .select("name")
        .eq("id", version.legal_document_id)
        .single();
      const { data: client } = await db
        .from("client")
        .select("full_name")
        .eq("id", ctx.clientId)
        .single();
      const { data: partner } = await db
        .from("partner")
        .select("full_name")
        .eq("id", req.partner_id)
        .single();

      const practitionerName = (partner?.full_name as string | undefined) ?? "Roberto Scrigna";
      const patientName = (client?.full_name as string | undefined) ?? "";

      const generatedDate = new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());

      // Same shared fill + placeholder-detection as legal.generateEngagementLetter.
      const filled = fillEngagementLetter(version.body_md as string, {
        client_full_name: patientName,
        professional_name: practitionerName,
        generated_date: generatedDate,
      });

      return {
        requestId: req.id as string,
        status: req.status as string,
        documentName: (docRow?.name as string | undefined) ?? "Lettera di Incarico",
        versionNumber: version.version_number as number,
        versionLabel: (version.version_label as string | null) ?? `v${version.version_number}`,
        language: version.language as string,
        contentHash: version.content_hash as string,
        bodyMd: filled.filledMd,
        practitionerName,
        patientName,
        missingTokens: filled.missingTokens,
        pendingPlaceholders: filled.pendingPlaceholders,
      };
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
      return resolveSignedPdf(deps, input.requestId);
    }),

  // ── Coach (partner-scoped) reads — for the engagement-letter management UI ────

  /**
   * #29 coach — the client's current engagement-letter signing status.
   * PARTNER-SCOPED: the client must belong to ctx.partner (else NOT_FOUND). Reads
   * the LATEST signature_request for that client and collapses provider statuses to
   * { none | pending | signed }. Degrades cleanly to 'none' when no request exists.
   * Contract: { status, requestId?, signedAt?, versionLabel? }.
   */
  getClientLetterStatus: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = createSupabaseServiceRole();

      // Partner-scope: the client must belong to this partner (mirrors createSignatureRequest).
      const { data: client } = await db
        .from("client")
        .select("id")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!client?.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente non trovato." });
      }

      // Latest request for this client (any status).
      const { data: req } = await db
        .from("signature_request")
        .select("id, status, accepted_at, document_version_id, created_at")
        .eq("client_id", input.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!req?.id) return { status: "none" as const };

      // Resolve the version label for display (best-effort).
      let versionLabel: string | undefined;
      if (req.document_version_id) {
        const { data: v } = await db
          .from("legal_document_version")
          .select("version_label")
          .eq("id", req.document_version_id as string)
          .maybeSingle();
        versionLabel = (v?.version_label as string | undefined) ?? undefined;
      }

      const raw = req.status as string;
      if (raw === "signed") {
        return {
          status: "signed" as const,
          requestId: req.id as string,
          signedAt: (req.accepted_at as string | null) ?? undefined,
          versionLabel,
        };
      }
      if ((OPEN_STATUSES as readonly string[]).includes(raw)) {
        return { status: "pending" as const, requestId: req.id as string, versionLabel };
      }
      // declined / expired / cancelled → no active letter on file
      return { status: "none" as const };
    }),

  /**
   * #29 coach — download a client's SIGNED engagement letter (base64 PDF).
   * PARTNER-SCOPED: the request must belong to ctx.partner (else NOT_FOUND — we do
   * NOT leak existence). Only returns a document when the request is 'signed'.
   * Mutation to mirror the client downloadSignedDocument (on-demand regeneration).
   * Contract: { pdfBase64, mimeType, filename }.
   */
  downloadSignedForClient: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deps = buildDeps();
      const { data: req } = await deps.db
        .from("signature_request")
        .select("id, status")
        .eq("id", input.requestId)
        .eq("partner_id", ctx.partnerId)
        .maybeSingle();
      if (!req?.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Richiesta non trovata." });
      }
      if (req.status !== "signed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Documento non ancora firmato.",
        });
      }
      return resolveSignedPdf(deps, input.requestId);
    }),
});
