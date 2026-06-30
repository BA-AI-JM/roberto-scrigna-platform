/**
 * Pure state machine for the signing screen — no React, no I/O, fully testable.
 * Maps the request status + provider into the single phase the screen renders.
 */

export type SignPhase =
  | "signable" // open + internal provider → show document + accept gate
  | "signed" // already signed → confirmation + download, no re-accept
  | "declined"
  | "expired"
  | "cancelled"
  | "external" // provider ≠ internal → in-app accept not available
  | "unsignable"; // any other status → safe, no-crash fallback

const OPEN = new Set(["pending", "sent", "viewed"]);

/**
 * Resolve the phase. Order matters: a signed request always shows the signed
 * confirmation (download works for any provider); otherwise a non-internal
 * provider routes to the "handled externally" message; otherwise status drives.
 */
export function deriveSignPhase(status: string | null | undefined, provider: string | null | undefined): SignPhase {
  const s = (status ?? "").toLowerCase();
  if (s === "signed" || s === "completed") return "signed";
  if ((provider ?? "internal").toLowerCase() !== "internal") return "external";
  if (s === "declined" || s === "rejected") return "declined";
  if (s === "expired") return "expired";
  if (s === "cancelled" || s === "canceled" || s === "voided") return "cancelled";
  if (OPEN.has(s)) return "signable";
  return "unsignable";
}

/** Map a tRPC error code to a friendly Italian deny reason. */
export function denyMessage(code: string | null | undefined): string {
  switch ((code ?? "").toUpperCase()) {
    case "NOT_FOUND":
      return "Richiesta non trovata o non più disponibile. Controlla il link ricevuto dal tuo professionista.";
    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return "Non hai accesso a questa richiesta di firma.";
    default:
      return "Si è verificato un problema nel caricamento del documento. Riprova più tardi.";
  }
}

/** Italian long datetime for an accepted timestamp; "—" when absent/invalid. */
export function formatAcceptedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short human label for the recorded acceptance method. */
export function acceptanceMethodLabel(method: string | null | undefined): string {
  switch ((method ?? "").toLowerCase()) {
    case "in_app_ses":
      return "Firma elettronica semplice (in-app)";
    default:
      return method ? method : "Firma elettronica";
  }
}
