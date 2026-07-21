/**
 * #5/A1 — normalize a stored intake training session into the strict shape the
 * save schema requires.
 *
 * Sessions in `_intake.training_sessions` come from several generations of
 * writers; real data exists with startTime/endTime but NO duration_min
 * (e.g. `{rpe:7, modality:"cycling", startTime:"18:00", endTime:"19:30"}`).
 * The save schema strictly requires duration_min 1–480, so hydrating those
 * rows verbatim made EVERY subsequent save of the training card fail as
 * "invalid" (Roberto's bug). Normalizing at the read boundary fixes every
 * legacy shape regardless of who wrote it.
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Duration from a HH:MM range; overnight ranges wrap (+24h). Null if unusable. */
export function durationFromTimes(start?: unknown, end?: unknown): number | null {
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return null;
  let d = minutesOf(end) - minutesOf(start);
  if (d <= 0) d += 24 * 60;
  return Math.min(480, Math.max(1, d));
}

export interface NormalizedSession {
  modality: string;
  duration_min: number;
  rpe: number;
  startTime?: string;
  endTime?: string;
  kcal_override?: number;
}

export function normalizeIntakeSession(raw: unknown): NormalizedSession {
  const r = (raw ?? {}) as Record<string, unknown>;

  const modality =
    typeof r.modality === "string" && r.modality.trim() !== ""
      ? r.modality.slice(0, 100)
      : "Pesi — Ipertrofia";

  const rawDur = Number(r.duration_min);
  const duration_min =
    Number.isFinite(rawDur) && rawDur >= 1
      ? Math.min(480, Math.round(rawDur))
      : durationFromTimes(r.startTime, r.endTime) ?? 60;

  const rawRpe = Number(r.rpe);
  const rpe = Number.isFinite(rawRpe) ? Math.min(10, Math.max(1, Math.round(rawRpe))) : 7;

  const out: NormalizedSession = { modality, duration_min, rpe };

  if (typeof r.startTime === "string" && TIME_RE.test(r.startTime)) out.startTime = r.startTime;
  if (typeof r.endTime === "string" && TIME_RE.test(r.endTime)) out.endTime = r.endTime;

  const rawOvr = Number(r.kcal_override);
  if (Number.isFinite(rawOvr) && rawOvr > 0 && rawOvr <= 10000) {
    out.kcal_override = Math.round(rawOvr);
  }

  return out;
}
