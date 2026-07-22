import { describe, it, expect } from "vitest";
import {
  estimateSessionKcal,
  sessionMet,
  resolveCurveKey,
  SESSION_MET_CURVES,
  type CurveKey,
} from "../session-met-curves";

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
    expect(estimateSessionKcal("bjj", 82, 90, 6)).toBe(369);
  });

  it("TEST 2 — BJJ, 82 kg, 90 min, RPE 7 → 394 kcal", () => {
    expect(estimateSessionKcal("bjj", 82, 90, 7)).toBe(394);
  });

  it("TEST 3 — Kickboxing, 70 kg, 60 min, RPE 7 → 350 kcal", () => {
    expect(estimateSessionKcal("kickboxing", 70, 60, 7)).toBe(350);
  });

  it("TEST 4 — Kickboxing, 82 kg, 60 min, RPE 9 → 492 kcal", () => {
    expect(estimateSessionKcal("kickboxing", 82, 60, 9)).toBe(492);
  });

  it("TEST 5 — Strength, 82 kg, 75 min, RPE 5 → 308 kcal", () => {
    expect(estimateSessionKcal("strength_hypertrophy", 82, 75, 5)).toBe(308);
  });

  it("TEST 6 — Strength, 82 kg, 75 min, RPE 10 → 308 kcal (RPE ignored)", () => {
    expect(estimateSessionKcal("strength_hypertrophy", 82, 75, 10)).toBe(308);
  });

  it("TEST 7 — HIIT, 70 kg, 45 min, RPE 8 → 289 kcal", () => {
    expect(estimateSessionKcal("hiit_functional", 70, 45, 8)).toBe(289);
  });

  it("TEST 8 — Cyclic cardio, 70 kg, 60 min, RPE 8 → 560 kcal (uncapped)", () => {
    expect(estimateSessionKcal("cyclic_cardio", 70, 60, 8)).toBe(560);
  });

  it("TEST 9 — Combat Sambo → MMA curve, 80 kg, 60 min, RPE 8 → 416 kcal", () => {
    const key = resolveCurveKey("combat_sambo");
    expect(key).toBe("mma");
    expect(estimateSessionKcal(key!, 80, 60, 8)).toBe(416);
  });

  it("TEST 10 — BJJ, 82 kg, 90 min, RPE 7.5 → 431 kcal (interpolated MET 3.5)", () => {
    expect(sessionMet("bjj", 7.5)).toBeCloseTo(3.5, 5);
    expect(estimateSessionKcal("bjj", 82, 90, 7.5)).toBe(431);
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

  it("unknown sport returns null for the explicit 'other' workflow (spec §10)", () => {
    expect(resolveCurveKey("quidditch")).toBeNull();
  });

  it("combat_sambo resolves to the mma curve, never null (spec §8)", () => {
    expect(resolveCurveKey("combat_sambo")).toBe("mma");
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
});
