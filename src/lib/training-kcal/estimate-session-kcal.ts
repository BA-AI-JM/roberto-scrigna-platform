/**
 * Provisional per-session kcal estimate (#10) — display only.
 *
 * Uses the SAME mapping the engine uses so the badge is consistent with the
 * prescription, but is explicitly PROVISIONAL (not authoritative): the coach can
 * override it for unusual activities the taxonomy doesn't fit.
 *
 * Mapping mirrors src/engine/exercise.ts Method 2 (met_value), Roberto's No-HR
 * RPE-MET model — the curve MET is already the session average, so NO 0.85:
 *   met   = effectiveMet(resolveSportEntry(modality), rpe)   // training-modality.ts
 *   kcal  = round( met × weightKg × (durationMin / 60) )
 *
 * Pure + client-safe.
 */
import { resolveSportEntry, effectiveMet } from "@/services/training-modality";

export interface EstimableSession {
  modality?: string;
  duration_min?: number;
  rpe?: number;
}

/**
 * The provisional kcal for one session, or null when bodyweight is unknown
 * (the badge then shows "n/d"). Duration is clamped [1,480], default 60 — the
 * same clamp the engine's MET path applies.
 */
export function estimateSessionKcal(session: EstimableSession, bodyweightKg: number | null | undefined): number | null {
  if (bodyweightKg == null || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return null;
  const minutes = Math.min(480, Math.max(1, Number(session.duration_min) || 60));
  const met = effectiveMet(resolveSportEntry(session.modality), session.rpe);
  return Math.round(met * bodyweightKg * (minutes / 60));
}
