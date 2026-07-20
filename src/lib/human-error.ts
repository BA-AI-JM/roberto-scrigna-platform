/**
 * Map raw tRPC error messages to operator-readable Italian.
 *
 * Zod BAD_REQUEST errors arrive as a JSON-stringified issue array — shown raw
 * they read as English machine output (the "invalid" wall Roberto hit when a
 * calorie field failed validation). Anything that isn't a zod issue array
 * passes through unchanged, so this is safe to wrap around every mutation
 * error display.
 */

const FIELD_LABELS: Record<string, string> = {
  maintenanceKcalEstimate: "Stima kcal mantenimento",
  targetWeightKg: "Peso obiettivo (kg)",
  dailyDeficitKcal: "Deficit giornaliero (kcal)",
  proteinG: "Proteine (g)",
  fatG: "Grassi (g)",
  carbG: "Carboidrati (g)",
  mealCount: "Numero pasti",
  notes: "Note",
  weightKg: "Peso (kg)",
  heightCm: "Altezza (cm)",
  bodyFatPct: "Massa grassa (%)",
  dateOfBirth: "Data di nascita",
  email: "Email",
  fullName: "Nome completo",
  phone: "Telefono",
  energyLevel: "Energia",
  sleepQuality: "Sonno",
  adherencePct: "Aderenza (%)",
};

interface ZodIssueLite {
  path?: (string | number)[];
  code?: string;
  message?: string;
  minimum?: number;
  maximum?: number;
  inclusive?: boolean;
}

function issueDetail(i: ZodIssueLite): string {
  if (i.code === "too_small")
    return i.inclusive ? `deve essere almeno ${i.minimum}` : `deve essere maggiore di ${i.minimum}`;
  if (i.code === "too_big")
    return i.inclusive ? `deve essere al massimo ${i.maximum}` : `deve essere minore di ${i.maximum}`;
  if (i.code === "invalid_type" || i.code === "invalid_value") return "non è un valore valido";
  return "non è valido";
}

export function humanizeTrpcError(
  message: string | undefined | null,
  fallback = "Errore imprevisto. Riprova.",
): string {
  if (!message) return fallback;
  const t = message.trim();
  if (!t.startsWith("[")) return message;
  try {
    const issues = JSON.parse(t) as ZodIssueLite[];
    if (!Array.isArray(issues) || issues.length === 0) return message;
    const parts = issues.slice(0, 3).map((i) => {
      const key = [...(i.path ?? [])]
        .reverse()
        .find((p): p is string => typeof p === "string");
      const label = (key && FIELD_LABELS[key]) ?? key ?? "campo";
      return `${label}: ${issueDetail(i)}`;
    });
    const more = issues.length > 3 ? ` (+${issues.length - 3} altri)` : "";
    return `Valore non valido — ${parts.join("; ")}${more}. Correggi e riprova.`;
  } catch {
    return message;
  }
}
