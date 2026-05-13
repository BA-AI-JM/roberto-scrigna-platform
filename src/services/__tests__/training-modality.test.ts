/**
 * Tests for the intake-schedule → ExerciseSession mapping.
 */

import { describe, it, expect } from "vitest";
import {
  buildTrainingSessionFromIntake,
  modalityMet,
  rpeFactor,
  MODALITY_MET,
} from "../training-modality";

const SCHEDULE_4ON_3OFF = [
  "training",
  "rest",
  "training",
  "rest",
  "training",
  "training",
  "rest",
] as const;

describe("rpeFactor", () => {
  it("is 1.0 at RPE 5 and clamps RPE", () => {
    expect(rpeFactor(5)).toBeCloseTo(1.0, 6);
    expect(rpeFactor(10)).toBeCloseTo(1.2, 6);
    expect(rpeFactor(1)).toBeCloseTo(0.84, 6);
    expect(rpeFactor(99)).toBeCloseTo(1.2, 6); // clamped to 10
    expect(rpeFactor(0)).toBeCloseTo(0.84, 6); // clamped to 1
    expect(rpeFactor(undefined)).toBeCloseTo(0.8 + 0.04 * 7, 6); // default RPE 7
  });
});

describe("modalityMet", () => {
  it("returns the table value for known modalities", () => {
    expect(modalityMet("Arti marziali")).toBe(MODALITY_MET["Arti marziali"]);
    expect(modalityMet("Forza")).toBe(5.0);
  });
  it("falls back to the default for unknown / missing modalities", () => {
    expect(modalityMet("Qualcosa di strano")).toBe(5.0);
    expect(modalityMet(undefined)).toBe(5.0);
  });
});

describe("buildTrainingSessionFromIntake", () => {
  it("returns null when there is no intake training data", () => {
    expect(buildTrainingSessionFromIntake(undefined, SCHEDULE_4ON_3OFF)).toBeNull();
    expect(buildTrainingSessionFromIntake(null, SCHEDULE_4ON_3OFF)).toBeNull();
    expect(buildTrainingSessionFromIntake({}, SCHEDULE_4ON_3OFF)).toBeNull();
  });

  it("returns null when sessions exist only on non-training days", () => {
    // Day index 1 is a "rest" day in the schedule
    const sessions = { "1": [{ modality: "Forza", duration_min: 60, rpe: 7 }] };
    expect(buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF)).toBeNull();
  });

  it("builds a met_value session from a single training day", () => {
    // Day 0 is "training": one Forza session, 60 min, RPE 5 → MET = 5.0 * 1.0
    const sessions = { "0": [{ modality: "Forza", duration_min: 60, rpe: 5 }] };
    const result = buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF);
    expect(result).toEqual({ method: "met_value", durationMin: 60, metValue: 5.0 });
  });

  it("sums duration within a day and duration-weights the MET", () => {
    // Day 0: Forza 40min @ RPE5 (MET 5.0) + Cardio HIIT 20min @ RPE5 (MET 8.0)
    // weighted MET = (5*40 + 8*20) / 60 = (200 + 160)/60 = 6.0; total 60 min
    const sessions = {
      "0": [
        { modality: "Forza", duration_min: 40, rpe: 5 },
        { modality: "Cardio HIIT", duration_min: 20, rpe: 5 },
      ],
    };
    const result = buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF);
    expect(result).toEqual({ method: "met_value", durationMin: 60, metValue: 6.0 });
  });

  it("averages across multiple training days", () => {
    // Day 0: 60min Forza @ RPE5 → MET 5.0 ; Day 2: 30min Forza @ RPE5 → MET 5.0
    // avg minutes = 45 ; avg MET = 5.0
    const sessions = {
      "0": [{ modality: "Forza", duration_min: 60, rpe: 5 }],
      "2": [{ modality: "Forza", duration_min: 30, rpe: 5 }],
    };
    const result = buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF);
    expect(result).toEqual({ method: "met_value", durationMin: 45, metValue: 5.0 });
  });

  it("higher RPE increases the MET estimate", () => {
    const low = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Forza", duration_min: 60, rpe: 3 }] },
      SCHEDULE_4ON_3OFF
    );
    const high = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Forza", duration_min: 60, rpe: 9 }] },
      SCHEDULE_4ON_3OFF
    );
    expect(low!.metValue!).toBeLessThan(high!.metValue!);
  });

  it("clamps absurd durations and defaults missing ones", () => {
    const r1 = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Forza", duration_min: 99999, rpe: 5 }] },
      SCHEDULE_4ON_3OFF
    );
    expect(r1!.durationMin).toBe(480);
    const r2 = buildTrainingSessionFromIntake(
      { "0": [{ modality: "Forza", rpe: 5 }] }, // no duration → defaults to 60
      SCHEDULE_4ON_3OFF
    );
    expect(r2!.durationMin).toBe(60);
  });
});
