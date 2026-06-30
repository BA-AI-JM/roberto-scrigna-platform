/**
 * Reminder cadence due-logic (Build #07) — pure, deterministic (fixed nowMs).
 *
 * Proves: the default cadence (21d, catch 7) reproduces the existing
 * scanFeedbackDue window EXACTLY; custom cadences shift the window; everyDays=0
 * disables; resolveReminderSettings applies the right defaults.
 */

import { describe, test, expect } from "vitest";
import {
  isCadenceDue,
  isPastCadence,
  checkInReminderDue,
  bodyCompReminderDue,
  resolveReminderSettings,
  REMINDER_DEFAULTS,
  CHECK_IN_CATCH_DAYS,
} from "../reminder-due";

// Fixed "now" (UTC) so every assertion is deterministic across hosts.
const NOW = Date.parse("2026-06-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);

describe("isCadenceDue — default cadence (21d, catch 7) matches scanFeedbackDue", () => {
  const every = 21;
  const catch_ = CHECK_IN_CATCH_DAYS; // 7
  test.each([
    [21, true], // exactly everyDays ago → due (window start)
    [25, true], // inside [21, 28]
    [28, true], // everyDays+catch ago → due (window end, inclusive)
    [20, false], // too recent (more recent than everyDays)
    [29, false], // too old (beyond catch window)
  ])("anchor %i days ago → due=%s", (n, expected) => {
    expect(isCadenceDue(daysAgo(n), every, catch_, NOW)).toBe(expected);
  });
});

describe("isCadenceDue — custom cadence shifts the window", () => {
  test("every 14 days: due at 14..21 ago, not at 13 or 22", () => {
    expect(isCadenceDue(daysAgo(14), 14, 7, NOW)).toBe(true);
    expect(isCadenceDue(daysAgo(21), 14, 7, NOW)).toBe(true);
    expect(isCadenceDue(daysAgo(13), 14, 7, NOW)).toBe(false);
    expect(isCadenceDue(daysAgo(22), 14, 7, NOW)).toBe(false);
  });

  test("a default-21 client is NOT due when a 14-day client would be", () => {
    // anchor 14 days ago: due for everyDays=14, not for everyDays=21 → no surprise
    expect(isCadenceDue(daysAgo(14), 14, 7, NOW)).toBe(true);
    expect(isCadenceDue(daysAgo(14), 21, 7, NOW)).toBe(false);
  });
});

describe("isCadenceDue — disabled cadence", () => {
  test("everyDays = 0 is never due (body-comp off)", () => {
    expect(isCadenceDue(daysAgo(0), 0, 7, NOW)).toBe(false);
    expect(isCadenceDue(daysAgo(60), 0, 7, NOW)).toBe(false);
  });
  test("negative everyDays is never due", () => {
    expect(isCadenceDue(daysAgo(60), -5, 7, NOW)).toBe(false);
  });
  test("accepts full ISO timestamps as the anchor (takes the date part)", () => {
    expect(isCadenceDue(new Date(NOW - 21 * 86400000).toISOString(), 21, 7, NOW)).toBe(true);
  });
});

describe("resolveReminderSettings", () => {
  test("null row → defaults (check-in 21, body-comp 0/off, enabled)", () => {
    expect(resolveReminderSettings(null)).toEqual(REMINDER_DEFAULTS);
    expect(REMINDER_DEFAULTS).toEqual({ checkInEveryDays: 21, bodyCompEveryDays: 0, enabled: true });
  });
  test("maps a full row", () => {
    expect(
      resolveReminderSettings({
        check_in_every_days: 14,
        body_comp_every_days: 30,
        reminders_enabled: false,
      })
    ).toEqual({ checkInEveryDays: 14, bodyCompEveryDays: 30, enabled: false });
  });
  test("partial/null fields fall back to defaults individually", () => {
    expect(
      resolveReminderSettings({ check_in_every_days: 7, body_comp_every_days: null })
    ).toEqual({ checkInEveryDays: 7, bodyCompEveryDays: 0, enabled: true });
  });
});

const tsAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

describe("checkInReminderDue — enabled gate + window", () => {
  test("enabled=false suppresses an otherwise-due reminder (invariant c)", () => {
    expect(
      checkInReminderDue({ enabled: false, checkInEveryDays: 21 }, daysAgo(21), 7, NOW)
    ).toBe(false);
  });
  test("enabled default-21 reproduces the window edges (21/28 due, 20/29 not)", () => {
    const s = { enabled: true, checkInEveryDays: 21 };
    expect(checkInReminderDue(s, daysAgo(21), 7, NOW)).toBe(true);
    expect(checkInReminderDue(s, daysAgo(28), 7, NOW)).toBe(true);
    expect(checkInReminderDue(s, daysAgo(20), 7, NOW)).toBe(false);
    expect(checkInReminderDue(s, daysAgo(29), 7, NOW)).toBe(false);
  });
});

describe("isPastCadence", () => {
  test("true once the anchor is at least everyDays ago (no upper bound)", () => {
    expect(isPastCadence(daysAgo(30), 30, NOW)).toBe(true);
    expect(isPastCadence(daysAgo(90), 30, NOW)).toBe(true); // long-overdue still past
    expect(isPastCadence(daysAgo(29), 30, NOW)).toBe(false);
    expect(isPastCadence(daysAgo(5), 0, NOW)).toBe(false); // disabled
  });
});

describe("bodyCompReminderDue — opt-in + snapshot-anchored dedup", () => {
  const on = { enabled: true, bodyCompEveryDays: 30 };

  test("enabled=false → never (invariant c)", () => {
    expect(
      bodyCompReminderDue({ settings: { enabled: false, bodyCompEveryDays: 30 }, lastSnapshotDate: tsAgo(40), lastReminderAt: null, nowMs: NOW })
    ).toBe(false);
  });
  test("bodyCompEveryDays=0 (off) → never (invariant b: opt-in)", () => {
    expect(
      bodyCompReminderDue({ settings: { enabled: true, bodyCompEveryDays: 0 }, lastSnapshotDate: tsAgo(40), lastReminderAt: null, nowMs: NOW })
    ).toBe(false);
  });
  test("no baseline snapshot → never (don't nag)", () => {
    expect(bodyCompReminderDue({ settings: on, lastSnapshotDate: null, lastReminderAt: null, nowMs: NOW })).toBe(false);
  });
  test("past threshold + no prior reminder → due", () => {
    expect(bodyCompReminderDue({ settings: on, lastSnapshotDate: tsAgo(30), lastReminderAt: null, nowMs: NOW })).toBe(true);
  });
  test("long-overdue (60d, every 30) still due — no upper bound", () => {
    expect(bodyCompReminderDue({ settings: on, lastSnapshotDate: tsAgo(60), lastReminderAt: null, nowMs: NOW })).toBe(true);
  });
  test("not yet past threshold → not due", () => {
    expect(bodyCompReminderDue({ settings: on, lastSnapshotDate: tsAgo(29), lastReminderAt: null, nowMs: NOW })).toBe(false);
  });
  test("already reminded AFTER this snapshot → suppressed (no daily spam)", () => {
    expect(
      bodyCompReminderDue({ settings: on, lastSnapshotDate: tsAgo(35), lastReminderAt: tsAgo(5), nowMs: NOW })
    ).toBe(false);
  });
  test("a NEW snapshot since the last reminder re-arms the reminder", () => {
    // last reminder 38d ago (for an older snapshot); current snapshot 35d ago.
    expect(
      bodyCompReminderDue({ settings: on, lastSnapshotDate: tsAgo(35), lastReminderAt: tsAgo(38), nowMs: NOW })
    ).toBe(true);
  });
});
