/**
 * Pure validation for the kcal-override input. Empty input means "clear the
 * override" (revert to the estimate); a non-empty value must be a positive
 * integer within a sane bound.
 */
export const MAX_OVERRIDE_KCAL = 10000;

export function parseOverrideInput(str: string): { value: number | null; error: string | null } {
  const trimmed = (str ?? "").trim();
  if (trimmed === "") return { value: null, error: null }; // clear / revert to estimate
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { value: null, error: "Inserisci un numero intero." };
  if (n <= 0) return { value: null, error: "Inserisci un numero positivo." };
  if (n > MAX_OVERRIDE_KCAL) return { value: null, error: `Valore troppo alto (max ${MAX_OVERRIDE_KCAL}).` };
  return { value: n, error: null };
}

/** Map a tRPC error code to a short Italian message for the row. */
export function overrideErrorMessage(code: string | null | undefined): string {
  switch ((code ?? "").toUpperCase()) {
    case "FORBIDDEN":
    case "UNAUTHORIZED":
      return "Permesso negato.";
    case "BAD_REQUEST":
    case "PRECONDITION_FAILED":
      return "Valore non valido.";
    default:
      return "Salvataggio non riuscito.";
  }
}
