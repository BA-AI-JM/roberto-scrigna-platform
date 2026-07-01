/**
 * Pure validation + plain-Italian formatting for reminder cadences. No React,
 * no I/O — fully unit-testable.
 */
import type { ReminderSettings } from "./types";

export const CHECK_IN_MIN = 1;
export const CHECK_IN_MAX = 90;
export const BODY_COMP_MIN = 1;
export const BODY_COMP_MAX = 365;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  checkInEveryDays: 14,
  bodyCompEveryDays: 28,
  enabled: true,
};

/** Parse a day-count input string to a positive integer, or null if invalid. */
export function parseDays(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

/** Validate a single cadence; returns an Italian error message or null if OK. */
export function validateCadence(days: number | null, min: number, max: number): string | null {
  if (days === null) return "Inserisci un numero intero di giorni.";
  if (days < min || days > max) return `Scegli un valore tra ${min} e ${max} giorni.`;
  return null;
}

export interface ReminderValidation {
  checkIn: string | null;
  bodyComp: string | null;
  ok: boolean;
}

/**
 * Validate the editable settings. When reminders are disabled the cadences are
 * inactive, so they're not blocking — save is always allowed to turn them off.
 */
export function validateSettings(input: {
  enabled: boolean;
  checkInEveryDays: number | null;
  bodyCompEveryDays: number | null;
}): ReminderValidation {
  if (!input.enabled) return { checkIn: null, bodyComp: null, ok: true };
  const checkIn = validateCadence(input.checkInEveryDays, CHECK_IN_MIN, CHECK_IN_MAX);
  const bodyComp = validateCadence(input.bodyCompEveryDays, BODY_COMP_MIN, BODY_COMP_MAX);
  return { checkIn, bodyComp, ok: checkIn === null && bodyComp === null };
}

/** "ogni giorno" | "ogni 14 giorni". */
function everyDays(days: number): string {
  return days === 1 ? "ogni giorno" : `ogni ${days} giorni`;
}

/** Plain-Italian one-liner for a labelled cadence, e.g. "Check-in ogni 14 giorni". */
export function formatCadence(label: string, days: number): string {
  return `${label} ${everyDays(days)}`;
}

/** The effective-cadence summary shown under the controls. */
export function formatCadenceSummary(s: ReminderSettings): string {
  if (!s.enabled) return "Promemoria disattivati.";
  return `${formatCadence("Check-in", s.checkInEveryDays)} · ${formatCadence("Composizione corporea", s.bodyCompEveryDays)}.`;
}

/**
 * Build the settings payload from the form's raw input strings + toggle. Returns
 * settings=null when validation fails (so the caller blocks the save and shows
 * the messages). Pure — the single source of truth for "what gets saved".
 */
export function buildSettings(
  enabled: boolean,
  checkInStr: string,
  bodyCompStr: string
): { settings: ReminderSettings | null; validation: ReminderValidation } {
  const ci = parseDays(checkInStr);
  const bc = parseDays(bodyCompStr);
  const validation = validateSettings({ enabled, checkInEveryDays: ci, bodyCompEveryDays: bc });
  if (!validation.ok) return { settings: null, validation };
  return {
    settings: {
      enabled,
      checkInEveryDays: ci ?? DEFAULT_REMINDER_SETTINGS.checkInEveryDays,
      bodyCompEveryDays: bc ?? DEFAULT_REMINDER_SETTINGS.bodyCompEveryDays,
    },
    validation,
  };
}

/** Map a tRPC error code to a friendly Italian message for the card. */
export function reminderErrorMessage(code: string | null | undefined): string {
  switch ((code ?? "").toUpperCase()) {
    case "BAD_REQUEST":
    case "PRECONDITION_FAILED":
      return "Valori non validi. Controlla le cadenze e riprova.";
    case "FORBIDDEN":
    case "UNAUTHORIZED":
      return "Non hai i permessi per modificare questi promemoria.";
    case "NOT_FOUND":
      return "Cliente non trovato.";
    default:
      return "Si è verificato un problema. Riprova più tardi.";
  }
}
