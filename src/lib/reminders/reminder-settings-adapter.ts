/**
 * Data seam for the coach reminder settings (#07).
 *
 * The card reads/writes per-client reminder cadence via the (incoming) typed
 * procedures notification.getReminderSettings / updateReminderSettings, built in
 * parallel by the backend. To let the UI ship and be tested NOW, ALL fetching is
 * isolated here: it hits the same tRPC endpoint over raw HTTP (real wire format,
 * mockable by Playwright route-interception) and returns the exact shapes. When
 * the typed procedures land, each call becomes a ONE-LINE swap (see comments).
 */
import type { ReminderSettings, UpdateReminderSettingsInput } from "./types";

export class ReminderSettingsError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ReminderSettingsError";
    this.code = code;
  }
}

interface TrpcEnvelope {
  result?: { data?: unknown };
  error?: { json?: { message?: string; data?: { code?: string } }; data?: { code?: string }; message?: string };
}

/** Unwrap a tRPC (superjson) envelope, or throw a typed error with the tRPC code. */
export function parseReminderEnvelope(env: unknown): ReminderSettings {
  const e = (env ?? {}) as TrpcEnvelope;
  if (e.error) {
    const code = e.error.json?.data?.code ?? e.error.data?.code ?? "INTERNAL_SERVER_ERROR";
    const message = e.error.json?.message ?? e.error.message ?? "Errore nei promemoria.";
    throw new ReminderSettingsError(message, String(code));
  }
  const data = e.result?.data;
  const payload = data && typeof data === "object" && "json" in (data as Record<string, unknown>) ? (data as { json: unknown }).json : data;
  if (!payload || typeof payload !== "object") {
    throw new ReminderSettingsError("Risposta dei promemoria non valida.", "PARSE_ERROR");
  }
  return payload as ReminderSettings;
}

async function readEnvelope(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new ReminderSettingsError("Promemoria non disponibili.", res.status === 403 ? "FORBIDDEN" : res.status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR");
  }
}

/** Read the per-client reminder settings. */
export async function fetchReminderSettings(clientId: string): Promise<ReminderSettings> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase:
  //   return await trpcVanilla.notification.getReminderSettings.query({ clientId });
  const input = encodeURIComponent(JSON.stringify({ json: { clientId } }));
  const res = await fetch(`/api/trpc/notification.getReminderSettings?input=${input}`, { headers: { "content-type": "application/json" } });
  return parseReminderEnvelope(await readEnvelope(res));
}

/** Persist the per-client reminder settings; returns the saved settings. */
export async function saveReminderSettings(input: UpdateReminderSettingsInput): Promise<ReminderSettings> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase:
  //   return await trpcVanilla.notification.updateReminderSettings.mutate(input);
  const res = await fetch(`/api/trpc/notification.updateReminderSettings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  return parseReminderEnvelope(await readEnvelope(res));
}
