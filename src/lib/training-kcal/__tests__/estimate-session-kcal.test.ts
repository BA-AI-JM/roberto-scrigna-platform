/**
 * Provisional session kcal estimate — must match the engine's MET path
 * (resolveSportEntry + effectiveMet → met×kg×min/60), Roberto's No-HR RPE-MET
 * model. No 0.85: the curve MET is already the session average.
 */
import { describe, test, expect } from "vitest";
import { estimateSessionKcal } from "../estimate-session-kcal";

describe("estimateSessionKcal", () => {
  test("strength uses the flat MET 3.0 → round(3.0 × 80 × 1) = 240", () => {
    expect(estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }, 80)).toBe(240);
  });

  test("strength MET is RPE-independent (same estimate at RPE 1 and 10)", () => {
    const low = estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 60, rpe: 1 }, 80);
    const high = estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 60, rpe: 10 }, 80);
    expect(low).toBe(high);
    expect(low).toBe(240);
  });

  test("non-strength modality scales with RPE", () => {
    const low = estimateSessionKcal({ modality: "Corsa — Costante", duration_min: 60, rpe: 3 }, 80)!;
    const high = estimateSessionKcal({ modality: "Corsa — Costante", duration_min: 60, rpe: 9 }, 80)!;
    expect(high).toBeGreaterThan(low);
  });

  test("scales with duration and bodyweight", () => {
    const base = estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }, 80)!;
    expect(estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 120, rpe: 5 }, 80)).toBe(base * 2);
    expect(estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }, 40)).toBe(Math.round(base / 2));
  });

  test("returns null when bodyweight is unknown / non-positive", () => {
    expect(estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }, null)).toBeNull();
    expect(estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }, 0)).toBeNull();
    expect(estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }, undefined)).toBeNull();
  });

  test("missing/zero duration defaults to 60 min", () => {
    expect(estimateSessionKcal({ modality: "Pesi — Forza", duration_min: 0, rpe: 5 }, 80)).toBe(240);
    expect(estimateSessionKcal({ modality: "Pesi — Forza", rpe: 5 }, 80)).toBe(240);
  });
});
