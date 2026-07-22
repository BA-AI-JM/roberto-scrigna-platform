/**
 * Derive a training session's end time (Ora fine) from its start time + duration.
 *
 *   deriveEndTime("20:30", 90) → "22:00"
 *
 * Wraps past midnight (23:30 + 60 → "00:30"). Returns undefined when there's no
 * valid start time or duration to derive from — the caller then stores nothing
 * (never an empty string, which the server's HH:MM validation rejects).
 *
 * The output is always a valid "HH:MM", so it passes the same regex the server
 * uses (`^([01]\d|2[0-3]):[0-5]\d$`). Display-only for meal timing — the calorie
 * engine reads duration_min, never these clock times.
 */
export function deriveEndTime(
  startTime: string | undefined | null,
  durationMin: number | undefined | null
): string | undefined {
  if (!startTime) return undefined;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!m) return undefined;
  const dur = Number(durationMin);
  if (!Number.isFinite(dur) || dur <= 0) return undefined;

  const startMin = Number(m[1]) * 60 + Number(m[2]);
  const endMin = (startMin + Math.round(dur)) % (24 * 60);
  const hh = String(Math.floor(endMin / 60)).padStart(2, "0");
  const mm = String(endMin % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
