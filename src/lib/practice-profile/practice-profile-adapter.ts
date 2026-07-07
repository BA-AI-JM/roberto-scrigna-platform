/**
 * Data seam for the practice-profile settings (#29). The practiceProfile router
 * (getPracticeProfile / updatePracticeProfile) lands in PR #72 on the backend;
 * until it merges, `trpc.practiceProfile.*` doesn't exist in the client types.
 *
 * So the read/write go through this seam over raw HTTP (real tRPC wire format,
 * mockable) and become a ONE-LINE swap to the typed calls once #72 merges:
 *   fetch → trpcVanilla.practiceProfile.getPracticeProfile.query()
 *   save  → trpcVanilla.practiceProfile.updatePracticeProfile.mutate(fields)
 * fetchPracticeProfile degrades to all-null if the procedure isn't there yet, so
 * the form works today (empty fields, no error) and lights up when #72 lands.
 *
 * Contract (PR #72): 19 fields, each string | null; updatePracticeProfile is a
 * partner-scoped upsert, blanks → null.
 */

export interface PracticeProfile {
  professione: string | null;
  albo_ordine: string | null;
  albo_number: string | null;
  partita_iva: string | null;
  studio_address: string | null;
  delivery_mode: string | null;
  plan_delivery_days: string | null;
  cadenza: string | null;
  fee_importo: string | null;
  cassa_iva: string | null;
  fee_articolazione: string | null;
  payment_metodo: string | null;
  payment_termine: string | null;
  durata: string | null;
  cancellation_notice_hours: string | null;
  penale: string | null;
  numero_polizza: string | null;
  assicuratore: string | null;
  foro: string | null;
}

export type PracticeField = keyof PracticeProfile;

export const PRACTICE_FIELDS: PracticeField[] = [
  "professione", "albo_ordine", "albo_number", "partita_iva", "studio_address", "delivery_mode",
  "plan_delivery_days", "cadenza",
  "fee_importo", "cassa_iva", "fee_articolazione", "payment_metodo", "payment_termine",
  "durata", "cancellation_notice_hours", "penale",
  "numero_polizza", "assicuratore",
  "foro",
];

export const EMPTY_PRACTICE_PROFILE: PracticeProfile = Object.fromEntries(
  PRACTICE_FIELDS.map((k) => [k, null]),
) as unknown as PracticeProfile;

/** The 6 labelled groups (build order + sentence-case Italian labels). */
export const PRACTICE_GROUPS: {
  title: string;
  fields: { key: PracticeField; label: string; placeholder?: string; wide?: boolean }[];
}[] = [
  {
    title: "Studio e registrazione",
    fields: [
      { key: "professione", label: "Professione", placeholder: "es. Biologo nutrizionista" },
      { key: "albo_ordine", label: "Albo / Ordine", placeholder: "es. Ordine Nazionale dei Biologi" },
      { key: "albo_number", label: "Numero iscrizione albo" },
      { key: "partita_iva", label: "Partita IVA" },
      { key: "studio_address", label: "Indirizzo dello studio", placeholder: "Via, città, CAP", wide: true },
      { key: "delivery_mode", label: "Modalità di erogazione", placeholder: "es. In studio e online" },
    ],
  },
  {
    title: "Prestazione",
    fields: [
      { key: "plan_delivery_days", label: "Giorni di consegna del piano", placeholder: "es. 7 giorni lavorativi" },
      { key: "cadenza", label: "Cadenza dei follow-up", placeholder: "es. Ogni 3 settimane" },
    ],
  },
  {
    title: "Compenso e fiscale",
    fields: [
      { key: "fee_importo", label: "Compenso", placeholder: "es. € 350 + IVA" },
      { key: "cassa_iva", label: "Cassa previdenziale / IVA", placeholder: "es. + 4% ENPAB, IVA esente" },
      { key: "fee_articolazione", label: "Articolazione del compenso", placeholder: "es. 50% all'avvio, 50% alla consegna", wide: true },
      { key: "payment_metodo", label: "Metodo di pagamento", placeholder: "es. Bonifico bancario" },
      { key: "payment_termine", label: "Termine di pagamento", placeholder: "es. 30 giorni" },
    ],
  },
  {
    title: "Durata e recesso",
    fields: [
      { key: "durata", label: "Durata dell'incarico", placeholder: "es. 3 mesi" },
      { key: "cancellation_notice_hours", label: "Preavviso di disdetta (ore)", placeholder: "es. 48" },
      { key: "penale", label: "Penale", placeholder: "es. 50% del compenso", wide: true },
    ],
  },
  {
    title: "Assicurazione",
    fields: [
      { key: "numero_polizza", label: "Numero di polizza" },
      { key: "assicuratore", label: "Compagnia assicurativa" },
    ],
  },
  {
    title: "Legale",
    fields: [
      { key: "foro", label: "Foro competente", placeholder: "es. Foro di Milano" },
    ],
  },
];

export class PracticeProfileError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PracticeProfileError";
    this.code = code;
  }
}

interface TrpcEnvelope {
  result?: { data?: unknown };
  error?: { json?: { message?: string; data?: { code?: string } }; message?: string; data?: { code?: string } };
}

/** Unwrap a tRPC (superjson) envelope; throw a typed error carrying the tRPC code. */
export function parsePracticeEnvelope<T>(env: unknown): T {
  const e = (env ?? {}) as TrpcEnvelope;
  if (e.error) {
    const code = e.error.json?.data?.code ?? e.error.data?.code ?? "INTERNAL_SERVER_ERROR";
    throw new PracticeProfileError(e.error.json?.message ?? e.error.message ?? "Errore.", String(code));
  }
  const data = e.result?.data;
  return (data && typeof data === "object" && "json" in (data as Record<string, unknown>)
    ? (data as { json: unknown }).json
    : data) as T;
}

/** Normalise any partial payload to the full 19-field shape (missing → null). */
function normalize(raw: unknown): PracticeProfile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY_PRACTICE_PROFILE };
  for (const k of PRACTICE_FIELDS) {
    const v = r[k];
    out[k] = typeof v === "string" && v.length > 0 ? v : null;
  }
  return out;
}

/**
 * Current practice profile. Returns all-null gracefully when the procedure isn't
 * present yet (pre-#72) or nothing is saved — so the form renders empty, no error.
 */
export async function fetchPracticeProfile(): Promise<PracticeProfile> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase (after #72 merges):
  //   return await trpcVanilla.practiceProfile.getPracticeProfile.query();
  try {
    const res = await fetch("/api/trpc/practiceProfile.getPracticeProfile", {
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) return EMPTY_PRACTICE_PROFILE; // 404 (router absent) / 401 → treat as empty
    return normalize(parsePracticeEnvelope<PracticeProfile>(await res.json()));
  } catch {
    return EMPTY_PRACTICE_PROFILE;
  }
}

/** Upsert the practice profile (partner-scoped; blanks → null). */
export async function savePracticeProfile(fields: Partial<PracticeProfile>): Promise<void> {
  // ── DATA SEAM ── ONE-LINE SWAP at rebase (after #72 merges):
  //   await trpcVanilla.practiceProfile.updatePracticeProfile.mutate(fields);
  // blanks → null so the upsert clears cleared fields
  const payload: Record<string, string | null> = {};
  for (const k of PRACTICE_FIELDS) {
    const v = fields[k];
    payload[k] = typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  }
  let env: unknown = null;
  const res = await fetch("/api/trpc/practiceProfile.updatePracticeProfile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: payload }),
  });
  try {
    env = await res.json();
  } catch {
    env = null;
  }
  if (!res.ok || env == null) {
    throw new PracticeProfileError("Salvataggio non riuscito.", res.status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR");
  }
  parsePracticeEnvelope<unknown>(env); // throws on a tRPC error envelope
}
