/**
 * No-HR Session RPE-MET curves — Roberto's expenditure model v1.0.
 *
 * Source of truth: NO_HR_SESSION_RPE_MET_TECHNICAL_SPEC_V1_0 (§7 table, §8 JSON,
 * §15 acceptance tests). Each value is a SESSION-AVERAGE EFFECTIVE MET — it already
 * folds warm-up, instruction, drilling, rest, equipment changes and the short
 * high-intensity phase into one number for the whole clock. RPE SELECTS the value;
 * it is NOT a multiplier on a peak MET.
 *
 * Formula (spec §3): kcal = MET × body_mass_kg × (duration_min / 60), rounded.
 * No 0.85 recalibration, no net-MET subtraction, no EPOC, no efficiency factor,
 * no post-lookup cap.
 *
 * Exceptions:
 *  - strength_hypertrophy is flat 3.0 at every RPE — RPE is load-monitoring only,
 *    never used for kcal (spec §7.11).
 *  - combat_sambo borrows the mma curve (spec §8/§11).
 *  - cyclic_cardio is uncapped, climbing to 11.0 at RPE 10 (spec §7.13).
 *
 * This is the NO-heart-rate branch ONLY. When a valid HR trace exists the engine
 * uses the HR model instead (spec §12); these curves are never combined with it.
 *
 * Spec §18: do NOT edit these values silently — bump the model version and update
 * the §15 acceptance suite if they ever change.
 */

export type CurveKey =
  | "bjj"
  | "wrestling"
  | "judo"
  | "sport_sambo"
  | "boxing"
  | "muay_thai"
  | "kickboxing"
  | "karate"
  | "taekwondo"
  | "mma"
  | "strength_hypertrophy"
  | "hiit_functional"
  | "cyclic_cardio"
  | "team_sports"
  | "racquet_sports";

/** RPE (1–10) → session-average effective MET. Transcribed verbatim from spec §8. */
export const SESSION_MET_CURVES: Record<CurveKey, Readonly<Record<number, number>>> = {
  bjj:                  { 1: 1.8, 2: 2.0, 3: 2.5, 4: 2.6, 5: 2.8, 6: 3.0, 7: 3.2, 8: 3.8, 9: 4.8, 10: 5.5 },
  wrestling:            { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.2, 5: 3.5, 6: 4.0, 7: 4.5, 8: 5.0, 9: 5.5, 10: 6.0 },
  judo:                 { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.2, 5: 3.5, 6: 4.0, 7: 4.5, 8: 5.0, 9: 5.5, 10: 6.0 },
  sport_sambo:          { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.2, 5: 3.5, 6: 4.0, 7: 4.5, 8: 5.0, 9: 5.5, 10: 6.0 },
  boxing:               { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.5, 5: 4.0, 6: 4.5, 7: 5.0, 8: 5.5, 9: 6.0, 10: 6.0 },
  muay_thai:            { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.5, 5: 4.0, 6: 4.5, 7: 5.0, 8: 5.5, 9: 6.0, 10: 6.0 },
  kickboxing:           { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.5, 5: 4.0, 6: 4.5, 7: 5.0, 8: 5.5, 9: 6.0, 10: 6.0 },
  karate:               { 1: 1.8, 2: 2.3, 3: 2.8, 4: 3.1, 5: 3.5, 6: 4.0, 7: 4.5, 8: 5.0, 9: 5.5, 10: 6.0 },
  taekwondo:            { 1: 1.8, 2: 2.3, 3: 2.8, 4: 3.1, 5: 3.5, 6: 4.0, 7: 4.5, 8: 5.0, 9: 5.5, 10: 6.0 },
  mma:                  { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.4, 5: 3.8, 6: 4.2, 7: 4.7, 8: 5.2, 9: 5.7, 10: 6.0 },
  strength_hypertrophy: { 1: 3.0, 2: 3.0, 3: 3.0, 4: 3.0, 5: 3.0, 6: 3.0, 7: 3.0, 8: 3.0, 9: 3.0, 10: 3.0 },
  hiit_functional:      { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.5, 5: 4.0, 6: 4.5, 7: 5.0, 8: 5.5, 9: 6.0, 10: 6.0 },
  cyclic_cardio:        { 1: 2.5, 2: 3.0, 3: 3.5, 4: 4.0, 5: 5.0, 6: 6.0, 7: 7.0, 8: 8.0, 9: 9.5, 10: 11.0 },
  team_sports:          { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.5, 5: 4.0, 6: 4.5, 7: 5.0, 8: 5.5, 9: 6.0, 10: 6.5 },
  racquet_sports:       { 1: 2.0, 2: 2.5, 3: 3.0, 4: 3.5, 5: 4.0, 6: 4.5, 7: 5.0, 8: 5.5, 9: 6.0, 10: 6.5 },
};

const CURVE_KEYS = new Set<string>(Object.keys(SESSION_MET_CURVES));

/**
 * Resolve a raw sport/curve string to a canonical CurveKey.
 * Combat Sambo borrows the MMA curve (spec §8/§11). Unknown keys return null so the
 * caller runs the explicit "other" workflow (spec §10) — ask for the closest
 * category — rather than silently defaulting an unknown sport to a combat curve.
 */
export function resolveCurveKey(raw: string): CurveKey | null {
  if (raw === "combat_sambo") return "mma";
  return CURVE_KEYS.has(raw) ? (raw as CurveKey) : null;
}

const clampRpe = (rpe: number): number => Math.min(10, Math.max(1, rpe));

/**
 * Session-average effective MET for a curve at a given RPE.
 * Integer RPE → direct lookup. Decimal RPE → linear interpolation between adjacent
 * integer points (spec §9). Strength/hypertrophy is flat 3.0 regardless of RPE
 * (spec §7.11). RPE is clamped to [1,10]; the input boundary owns range validation.
 */
export function sessionMet(curveKey: CurveKey, rpe: number): number {
  if (curveKey === "strength_hypertrophy") return 3.0;

  const curve = SESSION_MET_CURVES[curveKey];
  const r = clampRpe(rpe);
  const lower = Math.floor(r);
  const upper = Math.ceil(r);
  // r ∈ [1,10] and lower/upper are integers in [1,10] → both keys always exist.
  const lowerMet = curve[lower]!;
  if (lower === upper) return lowerMet;

  const upperMet = curve[upper]!;
  const fraction = r - lower;
  return lowerMet + fraction * (upperMet - lowerMet);
}

/**
 * Full No-HR estimate (spec §3/§11): kcal = MET × body_mass_kg × hours, rounded.
 * The caller resolves the curve key first (see resolveCurveKey) so the "other"
 * workflow is handled at the boundary, not silently here.
 */
export function estimateSessionKcal(
  curveKey: CurveKey,
  bodyMassKg: number,
  durationMin: number,
  rpe: number
): number {
  const met = sessionMet(curveKey, rpe);
  return Math.round(met * bodyMassKg * (durationMin / 60));
}

/**
 * Session-RPE scale descriptions (spec §6), Italian. RPE here is the WHOLE-session
 * rating — "how demanding was the entire session, including pauses and recovery" —
 * NOT the peak. The UI label must reinforce that meaning (spec §4), because the
 * curves are calibrated to the whole-session reading.
 */
export const RPE_SESSION_SCALE_IT: Readonly<Record<number, string>> = {
  1: "Recupero / molto leggera",
  2: "Molto leggera",
  3: "Facile",
  4: "Facile-moderata",
  5: "Moderata",
  6: "Moderatamente impegnativa",
  7: "Impegnativa",
  8: "Molto impegnativa",
  9: "Estremamente impegnativa",
  10: "Massimale / gara",
};

/** The whole-session RPE prompt the coach reads (spec §4). */
export const RPE_SESSION_QUESTION_IT =
  "Quanto è stata impegnativa l'intera sessione, incluse pause e recupero?";

/** Short descriptor for an RPE value (clamped to 1–10). */
export function rpeScaleLabelIt(rpe: number): string {
  const r = Math.min(10, Math.max(1, Math.round(rpe)));
  return RPE_SESSION_SCALE_IT[r] ?? "";
}
