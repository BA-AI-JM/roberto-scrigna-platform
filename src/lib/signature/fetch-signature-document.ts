/**
 * Data seam for the signing document.
 *
 * The patient signing screen needs the engagement-letter body + header + the
 * placeholder gaps for ONE request. That data comes from the (incoming) typed
 * procedure `signature.getSignatureDocument`, which lands in backend PR #45.
 *
 * To let the UI be built and tested NOW — in parallel with #45 — ALL document
 * fetching is isolated in this one adapter. It hits the same tRPC endpoint over
 * raw HTTP (so the wire format is real and Playwright route-interception can
 * mock it) and returns the exact SignatureDocument shape. When #45 lands, the
 * swap is a single line (see the comment in fetchSignatureDocument).
 *
 * Everything else the screen needs uses the typed signature.* procedures that
 * already exist on #43 (getSignatureRequest, acceptSignature, downloadSignedDocument).
 */
import type { SignatureDocument } from "./types";

export class SignatureDocumentError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "SignatureDocumentError";
    this.code = code;
  }
}

interface TrpcEnvelope {
  result?: { data?: unknown };
  error?: { json?: { message?: string; data?: { code?: string } }; data?: { code?: string }; message?: string };
}

/** tRPC single-call GET URL with a superjson-serialized input ({ json: ... }). */
export function signatureDocumentUrl(requestId: string): string {
  const input = encodeURIComponent(JSON.stringify({ json: { requestId } }));
  return `/api/trpc/signature.getSignatureDocument?input=${input}`;
}

/**
 * Parse a tRPC (superjson) envelope into a SignatureDocument, or throw a typed
 * SignatureDocumentError carrying the tRPC error code. Exported for unit tests.
 */
export function parseSignatureDocumentEnvelope(env: unknown): SignatureDocument {
  const e = (env ?? {}) as TrpcEnvelope;
  if (e.error) {
    const code = e.error.json?.data?.code ?? e.error.data?.code ?? "INTERNAL_SERVER_ERROR";
    const message = e.error.json?.message ?? e.error.message ?? "Errore nel caricamento del documento.";
    throw new SignatureDocumentError(message, String(code));
  }
  const data = e.result?.data;
  // superjson wraps the value as { json, meta }; tolerate a plain value too.
  const payload = data && typeof data === "object" && "json" in (data as Record<string, unknown>) ? (data as { json: unknown }).json : data;
  if (!payload || typeof payload !== "object") {
    throw new SignatureDocumentError("Risposta del documento non valida.", "PARSE_ERROR");
  }
  return payload as SignatureDocument;
}

/**
 * Fetch the signing document for a request. Throws SignatureDocumentError on a
 * deny / not-found / transport failure (the screen maps the code to a friendly
 * message). Robust to non-JSON and non-200 responses.
 */
export async function fetchSignatureDocument(requestId: string): Promise<SignatureDocument> {
  // ── DATA SEAM (PR #45) ──────────────────────────────────────────────────────
  // ONE-LINE SWAP at rebase — replace the fetch+parse below with the typed call:
  //   return await trpcVanilla.signature.getSignatureDocument.query({ requestId });
  const res = await fetch(signatureDocumentUrl(requestId), { headers: { "content-type": "application/json" } });
  let env: unknown = null;
  try {
    env = await res.json();
  } catch {
    env = null;
  }
  if (env == null) {
    throw new SignatureDocumentError(
      "Documento non disponibile.",
      res.status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR"
    );
  }
  return parseSignatureDocumentEnvelope(env);
}
