/**
 * Body fat estimation using Jackson & Pollock equations.
 * Three methods in priority order: 7-site > 3-site > heuristic.
 */

import type {
  Sex,
  Skinfold7Site,
  Skinfold3Site,
  Skinfold3SiteMale,
  Skinfold3SiteFemale,
  BodyComposition,
  ClientSnapshot,
} from "./types";

// ── Jackson & Pollock 7-Site ──────────────────────────────────────────────────

/** Sum of 7 skinfold sites in mm */
function sum7(sf: Skinfold7Site): number {
  return (
    sf.chest +
    sf.midaxillary +
    sf.tricep +
    sf.subscapular +
    sf.abdominal +
    sf.suprailiac +
    sf.thigh
  );
}

/**
 * J&P 7-site body density equation.
 * Male:   BD = 1.112 - 0.00043499(S) + 0.00000055(S^2) - 0.00028826(age)
 * Female: BD = 1.097  - 0.00046971(S) + 0.00000056(S^2) - 0.00012828(age)
 */
function bodyDensity7Site(sf: Skinfold7Site, sex: Sex, age: number): number {
  const s = sum7(sf);
  if (sex === "male") {
    return 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * age;
  }
  return 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * age;
}

// ── Jackson & Pollock 3-Site ──────────────────────────────────────────────────

function sum3(sf: Skinfold3Site, sex: Sex): number {
  if (sex === "male") {
    const m = sf as Skinfold3SiteMale;
    return m.chest + m.abdominal + m.thigh;
  }
  const f = sf as Skinfold3SiteFemale;
  return f.tricep + f.suprailiac + f.thigh;
}

/**
 * J&P 3-site body density equation.
 * Male:   BD = 1.10938 - 0.0008267(S) + 0.0000016(S^2) - 0.0002574(age)
 * Female: BD = 1.0994921 - 0.0009929(S) + 0.0000023(S^2) - 0.0001392(age)
 */
function bodyDensity3Site(sf: Skinfold3Site, sex: Sex, age: number): number {
  const s = sum3(sf, sex);
  if (sex === "male") {
    return 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * age;
  }
  return 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * age;
}

// ── Siri Equation ─────────────────────────────────────────────────────────────

/** Convert body density to body fat % using Siri equation: BF% = (495/BD) - 450 */
function siriBodyFatPct(bodyDensity: number): number {
  return 495 / bodyDensity - 450;
}

// ── Heuristic Estimation ──────────────────────────────────────────────────────

/**
 * Simple BMI-based heuristic for body fat when no skinfold data available.
 * Deurenberg et al. (1991): BF% = 1.20 × BMI + 0.23 × age - 10.8 × sex - 5.4
 * where sex = 1 for male, 0 for female
 */
function heuristicBodyFatPct(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex
): number {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const sexFactor = sex === "male" ? 1 : 0;
  return 1.2 * bmi + 0.23 * age - 10.8 * sexFactor - 5.4;
}

// ── Public API ────────────────────────────────────────────────────────────────

export type BodyFatMethod = "7site" | "3site" | "heuristic" | "override";

export interface BodyFatResult {
  bodyComposition: BodyComposition;
  method: BodyFatMethod;
}

/**
 * Estimate body fat using the best available method.
 * Priority: manual override > 7-site > 3-site > heuristic
 */
export function estimateBodyFat(snapshot: ClientSnapshot): BodyFatResult {
  let bodyFatPct: number;
  let method: BodyFatMethod;

  if (snapshot.bodyFatPctOverride != null) {
    bodyFatPct = snapshot.bodyFatPctOverride;
    method = "override";
  } else if (snapshot.skinfold7) {
    const bd = bodyDensity7Site(snapshot.skinfold7, snapshot.sex, snapshot.ageYears);
    bodyFatPct = siriBodyFatPct(bd);
    method = "7site";
  } else if (snapshot.skinfold3) {
    const bd = bodyDensity3Site(snapshot.skinfold3, snapshot.sex, snapshot.ageYears);
    bodyFatPct = siriBodyFatPct(bd);
    method = "3site";
  } else {
    bodyFatPct = heuristicBodyFatPct(
      snapshot.weightKg,
      snapshot.heightCm,
      snapshot.ageYears,
      snapshot.sex
    );
    method = "heuristic";
  }

  // Clamp to reasonable range
  bodyFatPct = Math.max(3, Math.min(60, bodyFatPct));

  const fatMassKg = snapshot.weightKg * (bodyFatPct / 100);
  const leanMassKg = snapshot.weightKg - fatMassKg;

  return {
    bodyComposition: {
      bodyFatPct: Math.round(bodyFatPct * 10) / 10,
      leanMassKg: Math.round(leanMassKg * 100) / 100,
      fatMassKg: Math.round(fatMassKg * 100) / 100,
    },
    method,
  };
}
