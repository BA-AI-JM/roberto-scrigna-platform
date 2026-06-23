/**
 * Guardrail for #6: snapshot body-composition is computed from real
 * measurements and NULL when only a heuristic would be possible.
 *
 * Mocking the tRPC ctx.supabase chain for createSnapshot/submitIntakeForm is
 * impractical, so per the agreed fallback we unit-test the pure compute helper
 * that both mutations now call (computeSnapshotBodyComp). This asserts the
 * persisted shape (non-null body_fat_pct / lean_mass_kg / fat_mass_kg /
 * bmr_kcal) for a real skinfold set / override, and null otherwise.
 */

import { describe, test, expect } from "vitest";
import { computeSnapshotBodyComp } from "../body-comp";

const SEVEN = { chest: 10, midaxillary: 10, tricep: 10, subscapular: 10, abdominal: 10, suprailiac: 10, thigh: 10 };

describe("computeSnapshotBodyComp (#6)", () => {
  test("computes body-fat, lean/fat mass and BMR from a 7-site skinfold set", () => {
    const r = computeSnapshotBodyComp({
      sex: "male",
      ageYears: 30,
      weightKg: 80,
      heightCm: 180,
      skinfold7: SEVEN,
    });
    expect(r).not.toBeNull();
    expect(r!.body_fat_pct).toBeGreaterThan(3);
    expect(r!.body_fat_pct).toBeLessThan(60);
    // lean + fat reconciles to total weight
    expect(r!.lean_mass_kg + r!.fat_mass_kg).toBeCloseTo(80, 0);
    // BMR is Katch-McArdle off the computed lean mass
    expect(r!.bmr_kcal).toBe(Math.round(370 + 21.6 * r!.lean_mass_kg));
  });

  test("computes from a sex-appropriate 3-site set", () => {
    const r = computeSnapshotBodyComp({
      sex: "female",
      ageYears: 28,
      weightKg: 60,
      skinfold3: { tricep: 12, suprailiac: 10, thigh: 14 },
    });
    expect(r).not.toBeNull();
    expect(r!.body_fat_pct).toBeGreaterThan(3);
    expect(r!.bmr_kcal).toBeGreaterThan(0);
  });

  test("computes from a manual body-fat override", () => {
    const r = computeSnapshotBodyComp({
      sex: "male",
      ageYears: 40,
      weightKg: 90,
      bodyFatPctOverride: 18,
    });
    expect(r).not.toBeNull();
    expect(r!.body_fat_pct).toBe(18);
    expect(r!.fat_mass_kg).toBeCloseTo(16.2, 1);
    expect(r!.lean_mass_kg).toBeCloseTo(73.8, 1);
  });

  test("returns null when only a BMI heuristic is possible (no skinfolds/override)", () => {
    const r = computeSnapshotBodyComp({ sex: "male", ageYears: 30, weightKg: 80, heightCm: 180 });
    expect(r).toBeNull();
  });

  test("returns null when sex is missing", () => {
    expect(
      computeSnapshotBodyComp({ sex: null, ageYears: 30, weightKg: 80, skinfold7: SEVEN })
    ).toBeNull();
  });

  test("returns null when weight is missing", () => {
    expect(
      computeSnapshotBodyComp({ sex: "male", ageYears: 30, weightKg: null, skinfold7: SEVEN })
    ).toBeNull();
  });
});
