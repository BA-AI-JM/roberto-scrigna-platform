/**
 * Data seam for the COACH side of the engagement-letter signing lifecycle.
 *
 * The coach can already, via REAL procedures: check/seed the template
 * (legal.getActiveVersion / seedDefaultEngagementLetter), generate a preview
 * (legal.generateEngagementLetter) and send for signing
 * (signature.createSignatureRequest). But reading a client's PERSISTENT signing
 * status and downloading the signed PDF are, on this branch, only exposed as
 * clientProcedure (patient-scoped) — the coach has no partner-scoped read.
 *
 * So those two reads are isolated here behind the seam: they call the (incoming)
 * partner-scoped procedures signature.getClientLetterStatus / downloadSignedForClient
 * over raw HTTP (real wire format, mockable) and become a ONE-LINE swap to the
 * typed calls once the backend adds them. fetchClientLetterStatus degrades to
 * "none" if the procedure isn't there yet, so the page works today (generate +
 * send are fully real; persistent status/download light up when the backend lands).
 */

export type LetterSignStatus =
  | "none"
  | "pending"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "cancelled";

export interface ClientLetterStatus {
  status: LetterSignStatus;
  requestId: string | null;
  signedAt: string | null;
  versionLabel: string | null;
}

export const NO_LETTER: ClientLetterStatus = { status: "none", requestId: null, signedAt: null, versionLabel: null };

export class CoachLetterError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "CoachLetterError";
    this.code = code;
  }
}

interface TrpcEnvelope {
  result?: { data?: unknown };
  error?: { json?: { message?: string; data?: { code?: string } }; data?: { code?: string }; message?: string };
}

/** Unwrap a tRPC (superjson) envelope, or throw a typed error with the tRPC code. */
export function parseCoachLetterEnvelope<T>(env: unknown): T {
  const e = (env ?? {}) as TrpcEnvelope;
  if (e.error) {
    const code = e.error.json?.data?.code ?? e.error.data?.code ?? "INTERNAL_SERVER_ERROR";
    throw new CoachLetterError(e.error.json?.message ?? e.error.message ?? "Errore.", String(code));
  }
  const data = e.result?.data;
  const payload = data && typeof data === "object" && "json" in (data as Record<string, unknown>) ? (data as { json: unknown }).json : data;
  if (payload === undefined || payload === null) throw new CoachLetterError("Risposta non valida.", "PARSE_ERROR");
  return payload as T;
}

/**
 * Persistent signing status for a client's engagement letter. Returns NO_LETTER
 * gracefully when the partner-scoped procedure isn't available yet — so the page
 * never crashes waiting on the backend.
 */
export async function fetchClientLetterStatus(clientId: string): Promise<ClientLetterStatus> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase:
  //   return await trpcVanilla.signature.getClientLetterStatus.query({ clientId });
  try {
    const input = encodeURIComponent(JSON.stringify({ json: { clientId } }));
    const res = await fetch(`/api/trpc/signature.getClientLetterStatus?input=${input}`, { headers: { "content-type": "application/json" } });
    if (!res.ok) return NO_LETTER; // procedure not present yet / no request → treat as none
    return parseCoachLetterEnvelope<ClientLetterStatus>(await res.json());
  } catch {
    return NO_LETTER;
  }
}

/** Download the signed PDF for a client's request (partner-scoped seam). */
export async function downloadSignedForClient(requestId: string): Promise<{ pdfBase64: string; mimeType: string; filename: string }> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase:
  //   return await trpcVanilla.signature.downloadSignedForClient.mutate({ requestId });
  const res = await fetch(`/api/trpc/signature.downloadSignedForClient`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { requestId } }),
  });
  let env: unknown = null;
  try {
    env = await res.json();
  } catch {
    env = null;
  }
  if (env == null || !res.ok) throw new CoachLetterError("Download non riuscito.", res.status === 403 ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR");
  return parseCoachLetterEnvelope<{ pdfBase64: string; mimeType: string; filename: string }>(env);
}

/** Status pill label + tone; tolerant of unknown values. */
export function letterStatusBadge(status: LetterSignStatus | string): { label: string; bg: string; fg: string } {
  switch ((status ?? "").toLowerCase()) {
    case "signed":
    case "completed":
      return { label: "Firmata", bg: "#f0fdf4", fg: "#166534" };
    case "pending":
    case "sent":
    case "viewed":
      return { label: "In attesa di firma", bg: "#fffbeb", fg: "#92400e" };
    case "declined":
    case "rejected":
      return { label: "Rifiutata", bg: "#fbeae7", fg: "#9f3a2f" };
    case "expired":
      return { label: "Scaduta", bg: "#fbf1e3", fg: "#8a560f" };
    case "cancelled":
    case "canceled":
      return { label: "Annullata", bg: "#f8fafc", fg: "#475569" };
    default:
      return { label: "Non inviata", bg: "#f8fafc", fg: "#475569" };
  }
}
