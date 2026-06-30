/**
 * Pure validation + formatting for the urgent-feedback / injury form. No React,
 * no I/O — fully unit-testable. Italian, warm voice.
 */
import type { UrgentKind, UrgentSubmissionInput } from "./types";

export const MAX_MESSAGE = 1000;

export const SEVERITY_OPTIONS = [
  { value: "lieve", label: "Lieve" },
  { value: "moderata", label: "Moderata" },
  { value: "grave", label: "Grave" },
] as const;

export interface UrgentFormState {
  kind: UrgentKind;
  message: string;
  area: string;
  severity: string;
  onsetDate: string;
  limitations: string;
}

export const EMPTY_URGENT_FORM: UrgentFormState = {
  kind: "feedback",
  message: "",
  area: "",
  severity: "",
  onsetDate: "",
  limitations: "",
};

export interface UrgentValidation {
  message: string | null;
  area: string | null;
  severity: string | null;
  onsetDate: string | null;
  ok: boolean;
}

function isValidDate(s: string): boolean {
  if (!s) return false;
  const t = new Date(s).getTime();
  return !Number.isNaN(t);
}

export function validateUrgent(f: UrgentFormState): UrgentValidation {
  const message =
    f.message.trim().length === 0
      ? "Scrivi un messaggio per il tuo coach."
      : f.message.trim().length > MAX_MESSAGE
        ? `Il messaggio è troppo lungo (max ${MAX_MESSAGE} caratteri).`
        : null;

  let area: string | null = null;
  let severity: string | null = null;
  let onsetDate: string | null = null;
  if (f.kind === "infortunio") {
    area = f.area.trim().length === 0 ? "Indica la zona interessata." : null;
    severity = SEVERITY_OPTIONS.some((o) => o.value === f.severity) ? null : "Seleziona la gravità.";
    onsetDate = isValidDate(f.onsetDate) ? null : "Indica la data di insorgenza.";
  }

  return { message, area, severity, onsetDate, ok: !message && !area && !severity && !onsetDate };
}

/**
 * Build the submit payload from the form. Returns payload=null when invalid (the
 * caller blocks the submit and shows the messages). Single source of truth for
 * "what gets sent".
 */
export function buildUrgentPayload(f: UrgentFormState): { payload: UrgentSubmissionInput | null; validation: UrgentValidation } {
  const validation = validateUrgent(f);
  if (!validation.ok) return { payload: null, validation };
  const payload: UrgentSubmissionInput = { kind: f.kind, message: f.message.trim() };
  if (f.kind === "infortunio") {
    const limitations = f.limitations.trim();
    payload.injury = {
      area: f.area.trim(),
      severity: f.severity,
      onsetDate: f.onsetDate,
      ...(limitations ? { limitations } : {}),
    };
  }
  return { payload, validation };
}

export function kindLabel(kind: UrgentKind): string {
  return kind === "infortunio" ? "Infortunio" : "Feedback urgente";
}

export function severityLabel(value: string): string {
  return SEVERITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Status pill style + label; tolerant of unknown server values. */
export function statusBadge(status: string): { label: string; bg: string; fg: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "gestito" || s === "handled" || s === "resolved" || s === "closed") {
    return { label: "Gestito", bg: "#f0fdf4", fg: "#166534" };
  }
  if (s === "aperto" || s === "open" || s === "new" || s === "pending") {
    return { label: "Aperto", bg: "#fffbeb", fg: "#92400e" };
  }
  return { label: status || "—", bg: "#f8fafc", fg: "#374151" };
}

export function formatSubmittedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}
