/**
 * Signed engagement-letter regeneration (Requirement #29, internal SES).
 *
 * The internal SES provider stores NO blob — it regenerates the signed PDF on
 * demand from the immutable letter version + the recorded acceptance, stamping
 * an SES attestation (eIDAS). Reuses the existing fill + renderer + puppeteer.
 *
 * Server-only (Puppeteer); injected into the internal provider as a dependency
 * so the provider/router tests can mock it without launching Chromium.
 */

import "server-only";
import { fillEngagementLetter } from "./legal-letter";
import { renderEngagementLetterHtml } from "../pdf/engagement-letter-renderer";
import { generateEngagementLetterPdf } from "./legal-letter-pdf";
import type { SignatureDb } from "./esign/types";

export async function renderSignedEngagementLetterPdf(
  db: SignatureDb,
  requestId: string
): Promise<Uint8Array> {
  const { data: req, error } = await db
    .from("signature_request")
    .select("id, client_id, partner_id, document_version_id, status, accepted_at, acceptance_method")
    .eq("id", requestId)
    .single();
  if (error || !req) throw new Error("signature request not found");
  if (req.status !== "signed") throw new Error("signature request not signed");

  const { data: version } = await db
    .from("legal_document_version")
    .select("legal_document_id, version_number, version_label, language, body_md, content_hash")
    .eq("id", req.document_version_id)
    .single();
  if (!version) throw new Error("document version not found");

  const { data: docRow } = await db
    .from("legal_document")
    .select("name")
    .eq("id", version.legal_document_id)
    .single();
  const { data: client } = await db
    .from("client")
    .select("full_name")
    .eq("id", req.client_id)
    .single();
  const { data: partner } = await db
    .from("partner")
    .select("full_name")
    .eq("id", req.partner_id)
    .single();

  const acceptedAt = req.accepted_at as string;
  const generatedDate = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(acceptedAt));

  const filled = fillEngagementLetter(version.body_md as string, {
    client_full_name: (client?.full_name as string | undefined) ?? "",
    professional_name: (partner?.full_name as string | undefined) ?? "Roberto Scrigna",
    generated_date: generatedDate,
  });

  const html = renderEngagementLetterHtml({
    bodyMd: filled.filledMd,
    documentName: (docRow?.name as string | undefined) ?? "Lettera di Incarico",
    versionLabel:
      (version.version_label as string | null) ?? `v${version.version_number}`,
    language: version.language as string,
    signature: {
      signerName: (client?.full_name as string | undefined) ?? "",
      signerCodiceFiscale: null, // not held on the client record (shown as n/d)
      acceptedAt,
      versionNumber: version.version_number as number,
      contentHash: version.content_hash as string,
      method: (req.acceptance_method as string | null) ?? "in_app_ses",
    },
  });

  return generateEngagementLetterPdf(html);
}
