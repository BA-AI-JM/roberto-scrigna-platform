import { describe, it, expect } from "vitest";
import {
  sessionMet,
  SESSION_MET_CURVES,
  type CurveKey,
} from "../session-met-curves";
import { buildTrainingSessionForDay } from "../../services/training-modality";
import { calculateExercise } from "../exercise";

// Spec §3 formula, inlined here so the acceptance suite verifies Roberto's numbers
// without depending on an app-side helper the app itself never calls.
const kcal = (key: CurveKey, kg: number, min: number, rpe: number): number =>
  Math.round(sessionMet(key, rpe) * kg * (min / 60));

/**
 * Roberto's §15 acceptance tests — THE gate for the whole No-HR RPE-MET model.
 *
 * Expected kcal are HIS published numbers (spec §14/§15), hardcoded independently of
 * the implementation. If any of these fail, the curve transcription or the formula is
 * wrong — not the test. Spec §18: these values are frozen; a change bumps the model
 * version and this suite with it.
 */
describe("No-HR Session RPE-MET — Roberto's §15 acceptance suite", () => {
  it("TEST 1 — BJJ, 82 kg, 90 min, RPE 6 → 369 kcal", () => {
    expect(kcal("bjj", 82, 90, 6)).toBe(369);
  });

  it("TEST 2 — BJJ, 82 kg, 90 min, RPE 7 → 394 kcal", () => {
    expect(kcal("bjj", 82, 90, 7)).toBe(394);
  });

  it("TEST 3 — Kickboxing, 70 kg, 60 min, RPE 7 → 350 kcal", () => {
    expect(kcal("kickboxing", 70, 60, 7)).toBe(350);
  });

  it("TEST 4 — Kickboxing, 82 kg, 60 min, RPE 9 → 492 kcal", () => {
    expect(kcal("kickboxing", 82, 60, 9)).toBe(492);
  });

  it("TEST 5 — Strength, 82 kg, 75 min, RPE 5 → 308 kcal", () => {
    expect(kcal("strength_hypertrophy", 82, 75, 5)).toBe(308);
  });

  it("TEST 6 — Strength, 82 kg, 75 min, RPE 10 → 308 kcal (RPE ignored)", () => {
    expect(kcal("strength_hypertrophy", 82, 75, 10)).toBe(308);
  });

  it("TEST 7 — HIIT, 70 kg, 45 min, RPE 8 → 289 kcal", () => {
    expect(kcal("hiit_functional", 70, 45, 8)).toBe(289);
  });

  it("TEST 8 — Cyclic cardio, 70 kg, 60 min, RPE 8 → 560 kcal (uncapped)", () => {
    expect(kcal("cyclic_cardio", 70, 60, 8)).toBe(560);
  });

  it("TEST 9 — Combat Sambo uses the MMA curve, 80 kg, 60 min, RPE 8 → 416 kcal", () => {
    // Spec §8: Combat Sambo maps to the MMA curve. It will route through the
    // taxonomy once a Combat Sambo entry is added; here we pin the MMA curve it lands on.
    expect(kcal("mma", 80, 60, 8)).toBe(416);
  });

  it("TEST 10 — BJJ, 82 kg, 90 min, RPE 7.5 → 431 kcal (interpolated MET 3.5)", () => {
    expect(sessionMet("bjj", 7.5)).toBeCloseTo(3.5, 5);
    expect(kcal("bjj", 82, 90, 7.5)).toBe(431);
  });
});

/** Guard rails beyond Roberto's suite — the three deliberate exceptions + boundary. */
describe("No-HR Session RPE-MET — invariants", () => {
  it("cyclic cardio exceeds the old 6-MET ceiling at high RPE (spec §7.13)", () => {
    expect(sessionMet("cyclic_cardio", 10)).toBe(11.0);
    expect(sessionMet("cyclic_cardio", 9)).toBe(9.5);
  });

  it("strength is flat 3.0 across every RPE (spec §7.11)", () => {
    for (let rpe = 1; rpe <= 10; rpe++) {
      expect(sessionMet("strength_hypertrophy", rpe)).toBe(3.0);
    }
  });

  it("RPE clamps to [1,10] rather than throwing", () => {
    expect(sessionMet("bjj", 0)).toBe(sessionMet("bjj", 1));
    expect(sessionMet("bjj", 12)).toBe(sessionMet("bjj", 10));
  });

  it("every curve is monotonic non-decreasing in RPE (sanity on the table)", () => {
    for (const key of Object.keys(SESSION_MET_CURVES) as CurveKey[]) {
      for (let rpe = 2; rpe <= 10; rpe++) {
        expect(sessionMet(key, rpe)).toBeGreaterThanOrEqual(
          sessionMet(key, rpe - 1)
        );
      }
    }
  });

  it("every curve value sits in a sane MET range [1.5, 11] (catches a fat-fingered digit)", () => {
    for (const key of Object.keys(SESSION_MET_CURVES) as CurveKey[]) {
      for (let rpe = 1; rpe <= 10; rpe++) {
        const m = sessionMet(key, rpe);
        expect(m, `${key}@${rpe}`).toBeGreaterThanOrEqual(1.5);
        expect(m, `${key}@${rpe}`).toBeLessThanOrEqual(11);
      }
    }
  });

  it("decimal RPE interpolates to the exact midpoint of its integer neighbours", () => {
    for (const key of Object.keys(SESSION_MET_CURVES) as CurveKey[]) {
      for (let lo = 1; lo <= 9; lo++) {
        const mid = sessionMet(key, lo + 0.5);
        const expected = (sessionMet(key, lo) + sessionMet(key, lo + 1)) / 2;
        expect(mid, `${key}@${lo}.5`).toBeCloseTo(expected, 6);
      }
    }
  });
});

/**
 * End-to-end: the SAME acceptance numbers must survive the full engine wiring
 * (intake builder → ExerciseSession → calculateExercise, no 0.85 on met_value),
 * not just the curve module in isolation. This is the Phase-1 integration gate —
 * it proves the taxonomy→curve resolver + effectiveMet + the exercise path all
 * agree with Roberto's §15 numbers.
 */
describe("No-HR RPE-MET — end-to-end through the engine", () => {
  const ctx = (kg: number) => ({ weightKg: kg, ageYears: 30, sex: "male" as const });
  const dayKcal = (modality: string, kg: number, min: number, rpe: number) => {
    const s = buildTrainingSessionForDay([{ modality, duration_min: min, rpe }], kg)!;
    expect(s.method).toBe("met_value");
    return calculateExercise(s, ctx(kg)).exerciseKcal;
  };

  it("BJJ 82 kg / 90 min / RPE 6 → 369 (Test 1)", () => {
    expect(dayKcal("BJJ — Classe", 82, 90, 6)).toBe(369);
  });
  it("BJJ 82 kg / 90 min / RPE 7 → 394 (Test 2)", () => {
    expect(dayKcal("BJJ — Classe", 82, 90, 7)).toBe(394);
  });
  it("Kickboxing 70 kg / 60 min / RPE 7 → 350 (Test 3)", () => {
    expect(dayKcal("Kickboxing", 70, 60, 7)).toBe(350);
  });
  it("Strength 82 kg / 75 min / RPE 5 → 308, no 0.85 on the path (Test 5)", () => {
    expect(dayKcal("Pesi — Forza", 82, 75, 5)).toBe(308);
  });
  it("Cyclic 70 kg / 60 min / RPE 8 → 560, uncapped (Test 8)", () => {
    expect(dayKcal("Corsa — Costante", 70, 60, 8)).toBe(560);
  });

  it("ONLY met_value (No-HR) skips the 0.85 — HR/estimate/default keep it (Ruling 3)", () => {
    const c = ctx(80);
    expect(
      calculateExercise({ method: "met_value", durationMin: 60, metValue: 5 }, c).recalibrationFactor
    ).toBe(1);
    expect(
      calculateExercise({ method: "session_estimate", durationMin: 60, kcalEstimate: 400 }, c).recalibrationFactor
    ).toBe(0.85);
    expect(
      calculateExercise({ method: "heart_rate", durationMin: 60, avgHeartRate: 150 }, c).recalibrationFactor
    ).toBe(0.85); // Keytel HR untouched
  });
});
