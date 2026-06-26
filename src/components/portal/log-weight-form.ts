/**
 * Pure validation/payload logic for the "Log weight" widget.
 *
 * Kept dependency-free (no React/tRPC) so it is unit-testable in the repo's
 * node-only vitest. Ranges mirror the server snapshotSchema (weight 30–300 kg,
 * body-fat 3–60%) so the client surfaces friendly errors instead of relying on
 * a server rejection.
 */

export interface SnapshotInput {
  weightKg: number;
  bodyFatPct?: number;
  notes?: string;
}

export type WeightFormResult =
  | { ok: true; payload: SnapshotInput }
  | { ok: false; error: string };

/** Parse a user-entered decimal, accepting comma or dot. Returns null if blank/invalid. */
export function parseDecimal(value: string): number | null {
  const t = value.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate the form and build the addSnapshot payload.
 * Weight is REQUIRED (the server allows it to be optional, but the widget does not).
 */
export function validateWeightInput(
  weightRaw: string,
  bodyFatRaw: string,
  noteRaw: string
): WeightFormResult {
  const weightKg = parseDecimal(weightRaw);
  if (weightKg == null) {
    return { ok: false, error: "Inserisci un peso valido." };
  }
  if (weightKg < 30 || weightKg > 300) {
    return { ok: false, error: "Il peso deve essere tra 30 e 300 kg." };
  }

  const payload: SnapshotInput = { weightKg };

  if (bodyFatRaw.trim() !== "") {
    const bodyFatPct = parseDecimal(bodyFatRaw);
    if (bodyFatPct == null || bodyFatPct < 3 || bodyFatPct > 60) {
      return { ok: false, error: "Grasso corporeo non valido (3–60%)." };
    }
    payload.bodyFatPct = bodyFatPct;
  }

  const note = noteRaw.trim();
  if (note !== "") {
    payload.notes = note;
  }

  return { ok: true, payload };
}
