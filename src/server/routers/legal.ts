/**
 * Legal Router — engagement-letter generation + versioned templates (Req #29, Stage 1).
 *
 * #29 is Tier 2: the app GENERATES + VERSIONS the engagement letter; the binding
 * SIGNATURE is delegated to an eIDAS e-signature provider in Stage 2 (contract in
 * src/server/esign/provider.ts). This router does NOT implement any signing,
 * acceptance, audit or consent logic — only template versioning + letter generation.
 *
 * Procedures (all partner-scoped — protectedProcedure, RLS-bound via ctx.supabase):
 * - createVersion               publish a new engagement-letter template version
 * - seedDefaultEngagementLetter idempotently publish v1 from the IT-03 template
 * - getActiveVersion            the partner's current active template version
 * - generateEngagementLetter    fill the active template for a client → PDF (preview)
 */

import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { createSupabaseServer } from "../../lib/supabase/server";
import { hashDocumentBody, ENGAGEMENT_LETTER_IT } from "../legal-templates";
import { fillEngagementLetter } from "../legal-letter";
import { generateEngagementLetterPdf } from "../legal-letter-pdf";
import { renderEngagementLetterHtml } from "../../pdf/engagement-letter-renderer";
import { PdfDependencyError } from "../../pdf/chromium-launcher";
import { throwDiscriminated } from "../db-errors";

// The RLS-bound server client carried on ctx.supabase (no generated DB types in this repo).
type Db = Awaited<ReturnType<typeof createSupabaseServer>>;

// ── Publish helper (shared by createVersion + seed) ─────────────────────────────

interface PublishInput {
  docKind: "engagement_letter";
  name: string;
  bodyMd: string;
  versionLabel?: string;
  language: string;
}

interface PublishResult {
  documentId: string;
  versionId: string;
  versionNumber: number;
  versionLabel: string | null;
  contentHash: string;
  status: string;
}

/**
 * Find-or-create the partner's legal_document for a kind, then publish a new
 * version: bump version_number, archive prior active versions to 'replaced'
 * (never overwrite content), insert the new active version with a SHA-256 hash.
 */
async function publishVersion(
  db: Db,
  partnerId: string,
  input: PublishInput
): Promise<PublishResult> {
  const { data: existingDoc, error: findErr } = await db
    .from("legal_document")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("doc_kind", input.docKind)
    .maybeSingle();
  if (findErr) {
    console.error("[router/legal.publishVersion:findDoc]", findErr);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Errore nel recupero del documento legale.",
    });
  }

  let documentId = existingDoc?.id as string | undefined;
  if (!documentId) {
    const { data: newDoc, error: insDocErr } = await db
      .from("legal_document")
      .insert({ partner_id: partnerId, doc_kind: input.docKind, name: input.name })
      .select("id")
      .single();
    if (insDocErr || !newDoc) {
      console.error("[router/legal.publishVersion:createDoc]", insDocErr);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Errore nella creazione del documento legale.",
      });
    }
    documentId = newDoc.id as string;
  }

  const { data: latest, error: latestErr } = await db
    .from("legal_document_version")
    .select("version_number")
    .eq("legal_document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) {
    console.error("[router/legal.publishVersion:latest]", latestErr);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Errore nel calcolo della versione.",
    });
  }
  const nextVersion = ((latest?.version_number as number | undefined) ?? 0) + 1;
  const contentHash = hashDocumentBody(input.bodyMd);

  // Archive prior active versions (status flag only — content untouched/frozen).
  const { error: replaceErr } = await db
    .from("legal_document_version")
    .update({ status: "replaced" })
    .eq("legal_document_id", documentId)
    .eq("status", "active");
  if (replaceErr) {
    console.error("[router/legal.publishVersion:archive]", replaceErr);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Errore nell'archiviazione della versione precedente.",
    });
  }

  const { data: version, error: insVerErr } = await db
    .from("legal_document_version")
    .insert({
      legal_document_id: documentId,
      version_number: nextVersion,
      version_label: input.versionLabel ?? `v${nextVersion}`,
      language: input.language,
      body_md: input.bodyMd,
      content_hash: contentHash,
      status: "active",
    })
    .select("id, version_number, version_label, content_hash, status")
    .single();
  if (insVerErr || !version) {
    console.error("[router/legal.publishVersion:insertVersion]", insVerErr);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Errore nella pubblicazione della versione.",
    });
  }

  return {
    documentId,
    versionId: version.id as string,
    versionNumber: version.version_number as number,
    versionLabel: (version.version_label as string | null) ?? null,
    contentHash: version.content_hash as string,
    status: version.status as string,
  };
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cliente"
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

export const legalRouter = router({
  /**
   * Publish a new version of the engagement-letter template. The prior active
   * version is marked 'replaced' and a new immutable row is inserted with a
   * SHA-256 content hash. Never overwrites previously published content.
   */
  createVersion: protectedProcedure
    .input(
      z.object({
        docKind: z.literal("engagement_letter").default("engagement_letter"),
        name: z.string().min(1).default(ENGAGEMENT_LETTER_IT.name),
        versionLabel: z.string().min(1).optional(),
        language: z.string().min(2).max(8).default("it"),
        bodyMd: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return publishVersion(ctx.supabase, ctx.partnerId, {
        docKind: input.docKind,
        name: input.name,
        bodyMd: input.bodyMd,
        versionLabel: input.versionLabel,
        language: input.language,
      });
    }),

  /**
   * Idempotently publish v1 of the engagement letter from the IT-03 template so
   * generation works out of the box. Returns the existing active version
   * unchanged if the partner already published one.
   */
  seedDefaultEngagementLetter: protectedProcedure.mutation(async ({ ctx }) => {
    const db = ctx.supabase;

    // Hash of the CURRENT code template — the body we'd publish. Comparing it to
    // the active version's content_hash makes the seed CONTENT-AWARE: it skips
    // only when the active body already matches the code, and it UPGRADES an
    // out-of-date active version (e.g. the old [PLACEHOLDER] body after the #29
    // retokenization) to the new {{token}} body on a re-click. Without this the
    // seed no-ops on ANY active version, so a code-template change could never
    // reach an already-seeded partner from the app (createVersion is UI-unwired).
    const currentHash = hashDocumentBody(ENGAGEMENT_LETTER_IT.bodyMd);

    const { data: doc, error: docErr } = await db
      .from("legal_document")
      .select("id")
      .eq("partner_id", ctx.partnerId)
      .eq("doc_kind", "engagement_letter")
      .maybeSingle();
    if (docErr) {
      console.error("[router/legal.seed:findDoc]", docErr);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Errore nel recupero del documento legale.",
      });
    }

    let hasOutdatedActive = false;
    if (doc?.id) {
      const { data: active, error: activeErr } = await db
        .from("legal_document_version")
        .select("id, version_number, content_hash")
        .eq("legal_document_id", doc.id)
        .eq("status", "active")
        .maybeSingle();
      if (activeErr) {
        console.error("[router/legal.seed:findActive]", activeErr);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Errore nel recupero della versione attiva.",
        });
      }
      if (active?.id) {
        // Active body already matches the code template → genuinely nothing to
        // do (idempotent; never inserts a duplicate version).
        if (active.content_hash === currentHash) {
          return {
            documentId: doc.id as string,
            versionId: active.id as string,
            versionNumber: active.version_number as number,
            alreadySeeded: true,
            outcome: "up_to_date" as const,
          };
        }
        // Hashes differ → the code template changed; fall through to publish the
        // new body (publishVersion archives this stale active version).
        hasOutdatedActive = true;
      }
    }

    // versionLabel omitted → publishVersion auto-numbers it (v1 first seed, v2 on
    // upgrade), so the label tracks the real version_number.
    const result = await publishVersion(db, ctx.partnerId, {
      docKind: ENGAGEMENT_LETTER_IT.docKind,
      name: ENGAGEMENT_LETTER_IT.name,
      bodyMd: ENGAGEMENT_LETTER_IT.bodyMd,
      language: ENGAGEMENT_LETTER_IT.language,
    });
    return {
      ...result,
      alreadySeeded: false,
      outcome: hasOutdatedActive ? ("upgraded" as const) : ("seeded" as const),
    };
  }),

  /** The partner's current active engagement-letter template version (or null). */
  getActiveVersion: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.supabase;

    const { data: doc } = await db
      .from("legal_document")
      .select("id, name")
      .eq("partner_id", ctx.partnerId)
      .eq("doc_kind", "engagement_letter")
      .maybeSingle();
    if (!doc?.id) return { version: null };

    const { data: version } = await db
      .from("legal_document_version")
      .select(
        "id, version_number, version_label, language, body_md, content_hash, published_at"
      )
      .eq("legal_document_id", doc.id)
      .eq("status", "active")
      .maybeSingle();
    if (!version?.id) return { version: null };

    return {
      version: {
        documentId: doc.id as string,
        documentName: doc.name as string,
        id: version.id as string,
        versionNumber: version.version_number as number,
        versionLabel: (version.version_label as string | null) ?? null,
        language: version.language as string,
        bodyMd: version.body_md as string,
        contentHash: version.content_hash as string,
        publishedAt: version.published_at as string,
      },
    };
  }),

  /**
   * Generate (fill + render to PDF) the engagement letter for a client from the
   * partner's active template. Returns the PDF (base64) for preview plus the gaps
   * still to be completed. Does NOT sign or store anything — signing is Stage 2.
   */
  generateEngagementLetter: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.supabase;

      // Client (scoped to the partner — cross-tenant guard via partner_id).
      const { data: client, error: clientErr } = await db
        .from("client")
        .select("id, full_name, codice_fiscale")
        .eq("id", input.clientId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .single();
      if (clientErr) {
        throwDiscriminated(
          clientErr,
          "Cliente non trovato.",
          "router/legal.generateEngagementLetter"
        );
      }
      if (!client) {
        throwDiscriminated(
          null,
          "Cliente non trovato.",
          "router/legal.generateEngagementLetter"
        );
      }

      // Professional name.
      const { data: partner } = await db
        .from("partner")
        .select("full_name")
        .eq("id", ctx.partnerId)
        .single();

      // Active template.
      const { data: doc } = await db
        .from("legal_document")
        .select("id, name")
        .eq("partner_id", ctx.partnerId)
        .eq("doc_kind", "engagement_letter")
        .maybeSingle();
      const activeVersion = doc?.id
        ? (
            await db
              .from("legal_document_version")
              .select("id, version_number, version_label, language, body_md, content_hash")
              .eq("legal_document_id", doc.id)
              .eq("status", "active")
              .maybeSingle()
          ).data
        : null;
      if (!doc?.id || !activeVersion?.id) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Nessun modello di lettera attivo. Pubblica prima un modello (seedDefaultEngagementLetter / createVersion).",
        });
      }

      // Practitioner practice profile (#29): fills the Albo / P.IVA / studio / fee /
      // insurer / foro / terms tokens. One row per partner (partner_practice_profile,
      // migration 015). Absent row or empty field → rendered as "[DA COMPLETARE: …]".
      const { data: profile } = await db
        .from("partner_practice_profile")
        .select(
          "professione, albo_ordine, albo_number, partita_iva, codice_fiscale, studio_address, delivery_mode, plan_delivery_days, cadenza, fee_importo, cassa_iva, fee_articolazione, payment_metodo, payment_termine, durata, cancellation_notice_hours, penale, numero_polizza, assicuratore, foro"
        )
        .eq("partner_id", ctx.partnerId)
        .maybeSingle();

      const generatedDate = new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());

      const versionLabel =
        (activeVersion.version_label as string | null) ?? `v${activeVersion.version_number}`;

      // Fill → render → PDF. Everything up to here is DB/precondition (handled with
      // NOT_FOUND / PRECONDITION_FAILED above); anything throwing HERE is the
      // template fill or the Chromium PDF step (the prod 500 lived here — an
      // UNHANDLED throw in the serverless PDF render surfaced as a raw HTTP 500).
      // Surface the REAL error server-side with full fidelity for diagnosis and
      // return a friendly INTERNAL_SERVER_ERROR instead of a raw 500.
      let filled: ReturnType<typeof fillEngagementLetter>;
      let pdf: Uint8Array;
      try {
        filled = fillEngagementLetter(activeVersion.body_md as string, {
          client_full_name: client.full_name as string,
          // Post-021: the client CF column exists — fill the token when present.
          client_codice_fiscale: (client.codice_fiscale as string | null) ?? undefined,
          professional_name: (partner?.full_name as string | undefined) ?? "Roberto Scrigna",
          generated_date: generatedDate,
          // Practitioner details from the practice profile (empty/absent → gaps).
          ...((profile as Record<string, string | null> | null) ?? {}),
          // codice fiscale + residenza are not held on the client record → left as gaps
        });

        const html = renderEngagementLetterHtml({
          bodyMd: filled.filledMd,
          documentName: doc.name as string,
          versionLabel,
          language: activeVersion.language as string,
          draft: true,
        });

        pdf = await generateEngagementLetterPdf(html);
      } catch (err) {
        console.error(
          "[router/legal.generateEngagementLetter] PDF/render failed:",
          err,
          err instanceof Error ? err.stack : ""
        );
        if (err instanceof PdfDependencyError) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Servizio PDF temporaneamente non disponibile",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Errore nella generazione del PDF della lettera. Riprova; se il problema persiste, contatta il supporto.",
        });
      }

      const filename = `incarico-${slugify(client.full_name as string)}-${slugify(versionLabel)}.pdf`;

      return {
        pdfBase64: Buffer.from(pdf).toString("base64"),
        filename,
        mimeType: "application/pdf",
        documentVersionId: activeVersion.id as string,
        versionNumber: activeVersion.version_number as number,
        versionLabel,
        contentHash: activeVersion.content_hash as string,
        missingTokens: filled.missingTokens,
        pendingPlaceholders: filled.pendingPlaceholders,
        draft: true,
      };
    }),
});
