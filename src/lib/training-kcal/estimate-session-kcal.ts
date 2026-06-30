/**
 * Provisional per-session kcal estimate (#10) — display only.
 *
 * Uses the SAME mapping the engine uses so the badge is consistent with the
 * prescription, but is explicitly PROVISIONAL (not authoritative): the coach can
 * override it for unusual activities the taxonomy doesn't fit.
 *
 * Mapping mirrors src/engine/exercise.ts Method 2 (met_value):
 *   met   = effectiveMet(resolveSportEntry(modality), rpe)   // training-modality.ts
 *   kcal  = round( met × weightKg × (durationMin / 60) × 0.85 )   // metKcal × RECALIBRATION_FACTOR
 *
 * Pure + client-safe.
 */
import { resolveSportEntry, effectiveMet } from "@/services/training-modality";

/** Mirrors RECALIBRATION_FACTOR in src/engine/exercise.ts (legacy methods 1–4). */
export const RECALIBRATION_FACTOR = 0.85;

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
  return Math.round(met * bodyweightKg * (minutes / 60) * RECALIBRATION_FACTOR);
}
