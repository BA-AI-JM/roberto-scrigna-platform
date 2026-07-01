/**
 * Data seam for the per-session kcal OVERRIDE (#10).
 *
 * Writes a coach's custom kcal for one training session via the (incoming) typed
 * procedure trainingLog.setSessionKcalOverride, built in parallel by the backend.
 * Display-only feature: this NEVER touches the generation-feeding session values
 * (modality/duration/RPE) — it's a separate, clearly-labelled override field.
 *
 * sessionId: planned grid sessions have no UUID, so the UI passes the composite
 * key "<dayIndex>:<sessionIndex>" (e.g. "0:1"). The backend keys the override by
 * this id; the swap to the typed call is one line at rebase.
 */

export class SessionKcalError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "SessionKcalError";
    this.code = code;
  }
}

interface TrpcEnvelope {
  error?: { json?: { message?: string; data?: { code?: string } }; data?: { code?: string }; message?: string };
}

function throwIfTrpcError(env: unknown): void {
  const e = (env ?? {}) as TrpcEnvelope;
  if (e.error) {
    const code = e.error.json?.data?.code ?? e.error.data?.code ?? "INTERNAL_SERVER_ERROR";
    throw new SessionKcalError(e.error.json?.message ?? e.error.message ?? "Salvataggio non riuscito.", String(code));
  }
}

/**
 * Set (or clear, when kcalOverride === null) the kcal override for one session.
 * Throws SessionKcalError on a deny / failure (the row maps it to a message).
 */
export async function setSessionKcalOverride(sessionId: string, kcalOverride: number | null): Promise<void> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase:
  //   await trpcVanilla.trainingLog.setSessionKcalOverride.mutate({ sessionId, kcalOverride }); return;
  const res = await fetch(`/api/trpc/trainingLog.setSessionKcalOverride`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { sessionId, kcalOverride } }),
  });
  let env: unknown = null;
  try {
    env = await res.json();
  } catch {
    env = null;
  }
  // Surface a tRPC error envelope (200-with-error) first for the better message…
  throwIfTrpcError(env);
  // …then fail any non-OK HTTP status regardless of body shape (a JSON body
  // lacking an `error` field must not be reported as a successful save).
  if (env == null || !res.ok) {
    throw new SessionKcalError(
      "Salvataggio non riuscito.",
      res.status === 403 ? "FORBIDDEN" : res.status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR"
    );
  }
}
