/**
 * Snapshot body-composition computation (#6).
 *
 * When a coach saves a measurement, the snapshot row should carry the derived
 * body-fat %, lean/fat mass and BMR — not just the raw skinfolds. The engine
 * already has `estimateBodyFat` + `calculateBmr` (used in plan generation); this
 * helper applies them at save time.
 *
 * Defensive rule: we persist derived values ONLY when there is a real
 * measurement basis (a complete skinfold set, or a body-fat override). With no
 * skinfolds/override `estimateBodyFat` falls back to a BMI heuristic — we detect
 * that (`method === "heuristic"`) and return null instead, so a coach who saved
 * only weight never gets a guessed body-fat number stored as if it were
 * measured. Callers are responsible for passing skinfold7/skinfold3 only when
 * the required sites are actually present.
 *
 * Pure (no DB / network) so it is unit-testable in isolation.
 */

import { estimateBodyFat } from "../engine/body-fat";
import { calculateBmr } from "../engine/bmr";
import type { ClientSnapshot } from "../engine/types";

export interface BodyCompInputs {
  sex: "male" | "female" | null | undefined;
  ageYears: number | null | undefined;
  weightKg: number | null | undefined;
  heightCm?: number | null | undefined;
  /** Set only when all 7 J&P sites are present. */
  skinfold7?: ClientSnapshot["skinfold7"];
  /** Set only when the sex-appropriate 3-site trio is present. */
  skinfold3?: ClientSnapshot["skinfold3"];
  /** Manual body-fat % override, if provided. */
  bodyFatPctOverride?: number;
}

/** Snake-case row fields ready to merge into a client_snapshot insert. */
export interface BodyCompRow {
  body_fat_pct: number;
  lean_mass_kg: number;
  fat_mass_kg: number;
  bmr_kcal: number;
}

/**
 * Compute body-fat %, lean/fat mass and BMR from a measurement, or return null
 * when there is no real basis (sex/age/weight missing, or only a heuristic
 * would be possible).
 */
export function computeSnapshotBodyComp(inputs: BodyCompInputs): BodyCompRow | null {
  if (inputs.sex == null || inputs.ageYears == null || inputs.weightKg == null) {
    return null;
  }

  const snapshot: ClientSnapshot = {
    sex: inputs.sex,
    ageYears: inputs.ageYears,
    weightKg: inputs.weightKg,
    heightCm: inputs.heightCm ?? 0,
    // Inert for body-fat/BMR — required only by the ClientSnapshot type.
    dailySteps: 0,
    occupationalLevel: "sedentary",
    weekSchedule: Array(7).fill("rest") as unknown as ClientSnapshot["weekSchedule"],
    skinfold7: inputs.skinfold7,
    skinfold3: inputs.skinfold3,
    bodyFatPctOverride: inputs.bodyFatPctOverride,
  };

  const bf = estimateBodyFat(snapshot);
  // No real measurement basis → don't persist a BMI guess as if measured.
  if (bf.method === "heuristic") return null;

  const bmr = calculateBmr(bf);
  return {
    body_fat_pct: bf.bodyComposition.bodyFatPct,
    lean_mass_kg: bf.bodyComposition.leanMassKg,
    fat_mass_kg: bf.bodyComposition.fatMassKg,
    bmr_kcal: bmr.bmrKcal,
  };
}
