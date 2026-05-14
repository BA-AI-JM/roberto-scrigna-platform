/**
 * Tests for the intake-schedule → ExerciseSession mapping.
 *
 * Spec rule under test: strength training MET is capped at 3 regardless of
 * RPE (v4.4 spec §Step 5 + Appendix C checklist). Non-strength modalities
 * use their canonical MET (Appendix D) with a modest RPE adjustment.
 */

import { describe, it, expect } from "vitest";
import {
  buildTrainingSessionFromIntake,
  rpeFactor,
  effectiveMet,
  resolveSportEntry,
} from "../training-modality";
import { findSportEntry, FALLBACK_MODALITY } from "../../engine/sport-taxonomy";

const SCHEDULE_4ON_3OFF = [
  "training",
  "rest",
  "training",
  "rest",
  "training",
  "training",
  "rest",
] as const;

// ── rpeFactor ────────────────────────────────────────────────────────────────

describe("rpeFactor", () => {
  it("is 1.0 at RPE 5 and clamps RPE to [1, 10]", () => {
    expect(rpeFactor(5)).toBeCloseTo(1.0, 6);
    expect(rpeFactor(10)).toBeCloseTo(1.2, 6);
    expect(rpeFactor(1)).toBeCloseTo(0.84, 6);
    expect(rpeFactor(99)).toBeCloseTo(1.2, 6); // clamped to 10
    expect(rpeFactor(0)).toBeCloseTo(0.84, 6); // clamped to 1
    expect(rpeFactor(undefined)).toBeCloseTo(0.8 + 0.04 * 7, 6); // default RPE 7
  });
});

// ── effectiveMet — the spec's strength cap ───────────────────────────────────

describe("effectiveMet — strength MET is capped at 3 regardless of RPE", () => {
  const strength = findSportEntry("Pesi — Forza")!;
  const running = findSportEntry("Corsa — Costante")!;

  it("strength returns the base MET 3 at any RPE", () => {
    expect(effectiveMet(strength, 1)).toBe(3.0);
    expect(effectiveMet(strength, 5)).toBe(3.0);
    expect(effectiveMet(strength, 10)).toBe(3.0);
    expect(effectiveMet(strength, undefined)).toBe(3.0);
  });

  it("non-strength scales with RPE", () => {
    expect(effectiveMet(running, 5)).toBeCloseTo(running.metGross * 1.0, 6);
    expect(effectiveMet(running, 10)).toBeCloseTo(running.metGross * 1.2, 6);
    expect(effectiveMet(running, 1)).toBeCloseTo(running.metGross * 0.84, 6);
  });
});

// ── resolveSportEntry — direct, legacy, unknown ─────────────────────────────

describe("resolveSportEntry", () => {
  it("resolves canonical display names directly", () => {
    expect(resolveSportEntry("Pesi — Forza")?.categoryId).toBe("STRENGTH");
    expect(resolveSportEntry("BJJ — Sparring")?.categoryId).toBe("GRAPPLING");
  });

  it("resolves legacy display names to canonical entries", () => {
    expect(resolveSportEntry("Forza").categoryId).toBe("STRENGTH"); // legacy → Pesi — Forza
    expect(resolveSportEntry("Cardio HIIT").categoryId).toBe("HIIT");
    expect(resolveSportEntry("Arti marziali").categoryId).toBe("MMA");
    expect(resolveSportEntry("Crossfit").categoryId).toBe("HIIT");
  });

  it("falls back for unknown / empty names", () => {
    expect(resolveSportEntry("Cose strane")).toEqual(FALLBACK_MODALITY);
    expect(resolveSportEntry(undefined)).toEqual(FALLBACK_MODALITY);
    expect(resolveSportEntry(null)).toEqual(FALLBACK_MODALITY);
    expect(resolveSportEntry("")).toEqual(FALLBACK_MODALITY);
  });
});

// ── buildTrainingSessionFromIntake — integration ────────────────────────────

describe("buildTrainingSessionFromIntake", () => {
  it("returns null when there is no intake training data", () => {
    expect(buildTrainingSessionFromIntake(undefined, SCHEDULE_4ON_3OFF)).toBeNull();
    expect(buildTrainingSessionFromIntake(null, SCHEDULE_4ON_3OFF)).toBeNull();
    expect(buildTrainingSessionFromIntake({}, SCHEDULE_4ON_3OFF)).toBeNull();
  });

  it("returns null when sessions exist only on non-training days", () => {
    // Day index 1 is a "rest" day in the schedule
    const sessions = { "1": [{ modality: "Pesi — Forza", duration_min: 60, rpe: 7 }] };
    expect(buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF)).toBeNull();
  });

  it("builds a met_value session from a single strength day at MET 3", () => {
    // Day 0 training: "Pesi — Forza" 60 min, RPE 5 → STRENGTH cap → MET 3
    const sessions = {
      "0": [{ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }],
    };
    const result = buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF);
    expect(result).toEqual({ method: "met_value", durationMin: 60, metValue: 3.0 });
  });

  it("strength MET does NOT change with RPE (spec cap)", () => {
    const low = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Pesi — Forza", duration_min: 60, rpe: 3 }] },
      SCHEDULE_4ON_3OFF
    );
    const high = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Pesi — Forza", duration_min: 60, rpe: 10 }] },
      SCHEDULE_4ON_3OFF
    );
    expect(low!.metValue!).toBe(3.0);
    expect(high!.metValue!).toBe(3.0);
  });

  it("non-strength MET scales with RPE", () => {
    const low = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Corsa — Costante", duration_min: 60, rpe: 3 }] },
      SCHEDULE_4ON_3OFF
    );
    const high = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Corsa — Costante", duration_min: 60, rpe: 9 }] },
      SCHEDULE_4ON_3OFF
    );
    expect(low!.metValue!).toBeLessThan(high!.metValue!);
  });

  it("sums duration and duration-weights the MET for a mixed day", () => {
    // Day 0: Pesi — Forza 40min @ RPE5 (MET 3.0, no RPE adjust)
    //      + HIIT / Intervalli 20min @ RPE5 (MET 9.0 × 1.0 = 9.0)
    // weighted MET = (3*40 + 9*20) / 60 = (120 + 180) / 60 = 5.0
    const sessions = {
      "0": [
        { modality: "Pesi — Forza", duration_min: 40, rpe: 5 },
        { modality: "HIIT / Intervalli", duration_min: 20, rpe: 5 },
      ],
    };
    const result = buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF);
    expect(result).toEqual({ method: "met_value", durationMin: 60, metValue: 5.0 });
  });

  it("averages across multiple training days", () => {
    // Day 0: 60min Pesi — Forza @ RPE5 → MET 3.0 ; Day 2: 30min Pesi — Forza @ RPE5 → MET 3.0
    // avg minutes = 45 ; avg MET = 3.0
    const sessions = {
      "0": [{ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }],
      "2": [{ modality: "Pesi — Forza", duration_min: 30, rpe: 5 }],
    };
    const result = buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF);
    expect(result).toEqual({ method: "met_value", durationMin: 45, metValue: 3.0 });
  });

  it("legacy modality names still resolve via the legacy map", () => {
    // "Forza" is the old intake string; it should resolve to STRENGTH (MET 3).
    const sessions = {
      "0": [{ modality: "Forza", duration_min: 60, rpe: 7 }],
    };
    const result = buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF);
    expect(result?.metValue).toBe(3.0);
  });

  it("clamps absurd durations and defaults missing ones", () => {
    const r1 = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Pesi — Forza", duration_min: 99999, rpe: 5 }] },
      SCHEDULE_4ON_3OFF
    );
    expect(r1!.durationMin).toBe(480);
    const r2 = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Pesi — Forza", rpe: 5 }] }, // no duration → defaults to 60
      SCHEDULE_4ON_3OFF
    );
    expect(r2!.durationMin).toBe(60);
  });
});
