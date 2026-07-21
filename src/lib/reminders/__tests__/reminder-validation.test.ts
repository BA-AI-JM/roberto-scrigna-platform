/**
 * Reminder cadence validation + plain-Italian formatting + the save-payload builder.
 */
import { describe, test, expect } from "vitest";
import {
  parseDays,
  validateCadence,
  validateSettings,
  buildSettings,
  formatCadence,
  formatCadenceSummary,
  reminderErrorMessage,
  CHECK_IN_MAX,
  BODY_COMP_MAX,
  DEFAULT_REMINDER_SETTINGS,
} from "../reminder-validation";
// Server truth — the client defaults must mirror these (imported so drift on
// either side fails this suite). reminder-due.ts is pure (no I/O).
import { REMINDER_DEFAULTS } from "../../../server/reminder-due";

describe("parseDays", () => {
  test("parses positive integers; null on empty/invalid/non-integer", () => {
    expect(parseDays("14")).toBe(14);
    expect(parseDays(28)).toBe(28);
    expect(parseDays("")).toBeNull();
    expect(parseDays(null)).toBeNull();
    expect(parseDays("abc")).toBeNull();
    expect(parseDays("3.5")).toBeNull();
  });
});

describe("validateCadence", () => {
  test("flags out-of-range and missing values", () => {
    expect(validateCadence(14, 1, 90)).toBeNull();
    expect(validateCadence(0, 1, 90)).toMatch(/tra 1 e 90/);
    expect(validateCadence(CHECK_IN_MAX + 1, 1, CHECK_IN_MAX)).toMatch(/tra 1 e 90/);
    expect(validateCadence(null, 1, 90)).toMatch(/numero intero di giorni/);
  });
});

describe("validateSettings", () => {
  test("valid when enabled + in range", () => {
    expect(validateSettings({ enabled: true, checkInEveryDays: 14, bodyCompEveryDays: 28 }).ok).toBe(true);
  });
  test("invalid when enabled + out of range", () => {
    const v = validateSettings({ enabled: true, checkInEveryDays: 999, bodyCompEveryDays: 28 });
    expect(v.ok).toBe(false);
    expect(v.checkIn).toMatch(/tra/);
  });
  test("always ok when disabled (you can switch reminders off)", () => {
    expect(validateSettings({ enabled: false, checkInEveryDays: null, bodyCompEveryDays: null }).ok).toBe(true);
  });
});

describe("buildSettings", () => {
  test("returns the exact payload from the form inputs when valid", () => {
    expect(buildSettings(true, "14", "28").settings).toEqual({ enabled: true, checkInEveryDays: 14, bodyCompEveryDays: 28 });
  });
  test("blocks (settings=null) and surfaces validation when out of range", () => {
    const r = buildSettings(true, "0", "28");
    expect(r.settings).toBeNull();
    expect(r.validation.checkIn).toMatch(/tra/);
  });
  test("disabled → settings carries enabled:false (cadences retained)", () => {
    expect(buildSettings(false, "14", "28").settings).toEqual({ enabled: false, checkInEveryDays: 14, bodyCompEveryDays: 28 });
  });
});

describe("formatting", () => {
  test("formatCadence pluralises Italian days", () => {
    expect(formatCadence("Check-in", 14)).toBe("Check-in ogni 14 giorni");
    expect(formatCadence("Check-in", 1)).toBe("Check-in ogni giorno");
  });
  test("formatCadenceSummary reflects enabled/disabled", () => {
    expect(formatCadenceSummary({ enabled: true, checkInEveryDays: 14, bodyCompEveryDays: 28 })).toContain("Check-in ogni 14 giorni");
    expect(formatCadenceSummary({ enabled: false, checkInEveryDays: 14, bodyCompEveryDays: 28 })).toBe("Promemoria disattivati.");
  });
});

describe("reminderErrorMessage", () => {
  test("maps known codes", () => {
    expect(reminderErrorMessage("FORBIDDEN")).toMatch(/permessi/i);
    expect(reminderErrorMessage("BAD_REQUEST")).toMatch(/non validi/i);
    expect(reminderErrorMessage("WHATEVER")).toMatch(/problema/i);
  });
});

// ── #12 fix: client defaults must equal server truth; body-comp 0 = OFF ─────────

describe("client defaults agree with server truth", () => {
  test("DEFAULT_REMINDER_SETTINGS === server REMINDER_DEFAULTS (check-in 21, body-comp 0 = off)", () => {
    expect(DEFAULT_REMINDER_SETTINGS.checkInEveryDays).toBe(REMINDER_DEFAULTS.checkInEveryDays);
    expect(DEFAULT_REMINDER_SETTINGS.bodyCompEveryDays).toBe(REMINDER_DEFAULTS.bodyCompEveryDays);
    expect(DEFAULT_REMINDER_SETTINGS.checkInEveryDays).toBe(21);
    expect(DEFAULT_REMINDER_SETTINGS.bodyCompEveryDays).toBe(0);
  });
});

describe("body-comp 0 = off", () => {
  test("validateSettings: body-comp 0 is a valid opt-out, not a range error", () => {
    const v = validateSettings({ enabled: true, checkInEveryDays: 21, bodyCompEveryDays: 0 });
    expect(v.ok).toBe(true);
    expect(v.bodyComp).toBeNull();
  });
  test("body-comp above max is still a range error (0 is the only opt-out)", () => {
    const v = validateSettings({ enabled: true, checkInEveryDays: 21, bodyCompEveryDays: BODY_COMP_MAX + 1 });
    expect(v.ok).toBe(false);
    expect(v.bodyComp).toMatch(/tra/);
  });
  test("formatCadenceSummary: body-comp 0 renders 'disattivata', never 'ogni 0 giorni'", () => {
    const s = formatCadenceSummary({ enabled: true, checkInEveryDays: 21, bodyCompEveryDays: 0 });
    expect(s).toContain("Composizione corporea: disattivata");
    expect(s).not.toMatch(/ogni 0 giorni/);
  });
});

describe("regression: the 21/0 stale-summary case (from the C3 screenshot)", () => {
  test("inputs 21/0 → settings non-null; summary says 21 + disattivata, no stale 14/28", () => {
    const r = buildSettings(true, "21", "0");
    expect(r.settings).toEqual({ enabled: true, checkInEveryDays: 21, bodyCompEveryDays: 0 });
    const summary = formatCadenceSummary(r.settings!);
    expect(summary).toBe("Check-in ogni 21 giorni · Composizione corporea: disattivata.");
    expect(summary).not.toContain("14");
    expect(summary).not.toContain("28");
  });
});
