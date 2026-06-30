/**
 * Reminder cadence due-logic (Build #07) — PURE, no I/O.
 *
 * One shared helper for both the check-in reminder and the (net-new) body-comp
 * reminder. `isCadenceDue` reproduces the existing scanFeedbackDue date-window
 * semantics EXACTLY for the default cadence (everyDays=21, catchDays=7), so
 * default clients see no behaviour change.
 */

export interface ReminderSettings {
  checkInEveryDays: number;
  bodyCompEveryDays: number; // 0 = off (body-comp reminders are opt-in)
  enabled: boolean;
}

/**
 * Defaults preserve today's behaviour: check-in every 21 days matches the
 * hardcoded FEEDBACK_DUE_DAYS; body-comp 0 = OFF (net-new, opt-in); enabled.
 */
export const REMINDER_DEFAULTS: ReminderSettings = {
  checkInEveryDays: 21,
  bodyCompEveryDays: 0,
  enabled: true,
};

/** Catch windows (a reminder fires if the anchor is everyDays..everyDays+catch ago). */
export const CHECK_IN_CATCH_DAYS = 7; // = FEEDBACK_CATCH_DAYS
export const BODY_COMP_CATCH_DAYS = 7;

/** Map a client_reminder_settings DB row (or null) to normalised settings + defaults. */
export function resolveReminderSettings(
  row:
    | {
        check_in_every_days?: number | null;
        body_comp_every_days?: number | null;
        reminders_enabled?: boolean | null;
      }
    | null
    | undefined
): ReminderSettings {
  return {
    checkInEveryDays: row?.check_in_every_days ?? REMINDER_DEFAULTS.checkInEveryDays,
    bodyCompEveryDays: row?.body_comp_every_days ?? REMINDER_DEFAULTS.bodyCompEveryDays,
    enabled: row?.reminders_enabled ?? REMINDER_DEFAULTS.enabled,
  };
}

function dateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Is a reminder due now for an item last "anchored" on `anchorDate`?
 * True iff the anchor date falls in the inclusive window
 *   [today − (everyDays + catchDays), today − everyDays]
 * i.e. the anchor is between everyDays and everyDays+catchDays ago. `everyDays <= 0`
 * means the cadence is disabled (e.g. body-comp off) → never due.
 *
 * Date-only (YYYY-MM-DD lexicographic = chronological) to match scanFeedbackDue.
 */
export function isCadenceDue(
  anchorDate: string,
  everyDays: number,
  catchDays: number,
  nowMs: number
): boolean {
  if (everyDays <= 0) return false;
  const dueEnd = dateOnly(nowMs - everyDays * 86400000); // anchor <= today − everyDays
  const dueStart = dateOnly(nowMs - (everyDays + catchDays) * 86400000); // anchor >= today − (everyDays+catch)
  const anchor = anchorDate.slice(0, 10);
  return anchor >= dueStart && anchor <= dueEnd;
}

/** True if the anchor is at LEAST everyDays ago (no upper bound). everyDays<=0 → never. */
export function isPastCadence(anchorDate: string, everyDays: number, nowMs: number): boolean {
  if (everyDays <= 0) return false;
  const threshold = dateOnly(nowMs - everyDays * 86400000);
  return anchorDate.slice(0, 10) <= threshold;
}

// ── Cron decision helpers (pure — the crons call these; tested directly) ──────

/**
 * Should the CHECK-IN reminder fire for a plan started on planStartDate?
 * Window semantics (reproduces the original scanFeedbackDue behaviour). Honours
 * the master `enabled` flag.
 */
export function checkInReminderDue(
  settings: Pick<ReminderSettings, "enabled" | "checkInEveryDays">,
  planStartDate: string,
  catchDays: number,
  nowMs: number
): boolean {
  if (!settings.enabled) return false;
  return isCadenceDue(planStartDate, settings.checkInEveryDays, catchDays, nowMs);
}

/**
 * Should the BODY-COMP reminder fire? Opt-in (bodyCompEveryDays>0) + master
 * `enabled`. Threshold (at least everyDays since the last snapshot) so even
 * long-overdue clients are reminded — but only ONCE per snapshot: a body_comp_due
 * notification dated at/after the anchor snapshot suppresses re-firing until a
 * NEW snapshot moves the anchor forward.
 */
export function bodyCompReminderDue(input: {
  settings: Pick<ReminderSettings, "enabled" | "bodyCompEveryDays">;
  lastSnapshotDate: string | null | undefined; // client_snapshot.taken_at
  lastReminderAt: string | null | undefined; // most recent body_comp_due notification.created_at
  nowMs: number;
}): boolean {
  const { settings, lastSnapshotDate, lastReminderAt, nowMs } = input;
  if (!settings.enabled) return false;
  if (settings.bodyCompEveryDays <= 0) return false; // off (opt-in)
  if (!lastSnapshotDate) return false; // no baseline measurement → don't nag
  if (!isPastCadence(lastSnapshotDate, settings.bodyCompEveryDays, nowMs)) return false;
  // Snapshot-anchored dedup: already reminded for this measurement gap.
  if (lastReminderAt && lastReminderAt >= lastSnapshotDate) return false;
  return true;
}
