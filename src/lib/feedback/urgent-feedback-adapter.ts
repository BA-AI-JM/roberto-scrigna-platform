/**
 * Data seam for the patient urgent-feedback flow (#28).
 *
 * The form submits and lists urgent feedback / injury reports via the (incoming)
 * typed procedures feedback.submitUrgent / getMyUrgentSubmissions, built in
 * parallel by the backend. To ship + test the UI now, ALL fetching is isolated
 * here: it hits the same tRPC endpoint over raw HTTP (real wire format, mockable
 * by Playwright route-interception) and returns the exact shapes. When the typed
 * procedures land, each call is a ONE-LINE swap (see comments).
 */
import type { UrgentSubmission, UrgentSubmissionInput } from "./types";

export class UrgentFeedbackError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "UrgentFeedbackError";
    this.code = code;
  }
}

interface TrpcEnvelope {
  result?: { data?: unknown };
  error?: { json?: { message?: string; data?: { code?: string } }; data?: { code?: string }; message?: string };
}

/** Unwrap a tRPC (superjson) envelope to its payload, or throw a typed error. */
export function parseUrgentEnvelope<T>(env: unknown): T {
  const e = (env ?? {}) as TrpcEnvelope;
  if (e.error) {
    const code = e.error.json?.data?.code ?? e.error.data?.code ?? "INTERNAL_SERVER_ERROR";
    const message = e.error.json?.message ?? e.error.message ?? "Errore nell'invio.";
    throw new UrgentFeedbackError(message, String(code));
  }
  const data = e.result?.data;
  const payload = data && typeof data === "object" && "json" in (data as Record<string, unknown>) ? (data as { json: unknown }).json : data;
  if (payload === undefined || payload === null) {
    throw new UrgentFeedbackError("Risposta non valida.", "PARSE_ERROR");
  }
  return payload as T;
}

async function readEnvelope(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new UrgentFeedbackError(
      "Servizio non disponibile.",
      res.status === 403 ? "FORBIDDEN" : res.status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR"
    );
  }
}

/** Submit an urgent feedback / injury report; returns the created submission. */
export async function submitUrgentFeedback(input: UrgentSubmissionInput): Promise<UrgentSubmission> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase:
  //   return await trpcVanilla.feedback.submitUrgent.mutate(input);
  const res = await fetch(`/api/trpc/feedback.submitUrgent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  return parseUrgentEnvelope<UrgentSubmission>(await readEnvelope(res));
}

/** List the patient's own urgent submissions (newest first, per the backend). */
export async function fetchMyUrgentSubmissions(): Promise<UrgentSubmission[]> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase:
  //   return await trpcVanilla.feedback.getMyUrgentSubmissions.query();
  const res = await fetch(`/api/trpc/feedback.getMyUrgentSubmissions`, { headers: { "content-type": "application/json" } });
  const list = parseUrgentEnvelope<UrgentSubmission[]>(await readEnvelope(res));
  return Array.isArray(list) ? list : [];
}
