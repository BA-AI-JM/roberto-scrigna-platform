/**
 * Tests for the intake-schedule → ExerciseSession mapping.
 *
 * Under test: Roberto's No-HR RPE-MET model (spec v1.0) — RPE reads a
 * session-average MET off the sport's curve; strength is flat 3.0 regardless of
 * RPE (spec §7.11). No 0.85 recalibration on this path.
 */

import { describe, it, expect } from "vitest";
import {
  buildTrainingSessionFromIntake,
  effectiveMet,
  resolveSportEntry,
} from "../training-modality";
import {
  findSportEntry,
  FALLBACK_MODALITY,
  SPORT_TAXONOMY,
  curveKeyForEntry,
} from "../../engine/sport-taxonomy";
import { SESSION_MET_CURVES } from "../../engine/session-met-curves";

const SCHEDULE_4ON_3OFF = [
  "training",
  "rest",
  "training",
  "rest",
  "training",
  "training",
  "rest",
] as const;

// ── effectiveMet — Roberto's No-HR RPE-MET curves ────────────────────────────

describe("effectiveMet — session-average MET from the sport's curve", () => {
  const strength = findSportEntry("Pesi — Forza")!;
  const running = findSportEntry("Corsa — Costante")!; // → cyclic_cardio curve

  it("strength is flat 3.0 at any RPE (spec §7.11)", () => {
    expect(effectiveMet(strength, 1)).toBe(3.0);
    expect(effectiveMet(strength, 5)).toBe(3.0);
    expect(effectiveMet(strength, 10)).toBe(3.0);
    expect(effectiveMet(strength, undefined)).toBe(3.0);
  });

  it("non-strength reads the curve and rises with RPE (cyclic §7.13)", () => {
    expect(effectiveMet(running, 5)).toBe(5.0);
    expect(effectiveMet(running, 10)).toBe(11.0);
    expect(effectiveMet(running, 1)).toBe(2.5);
    expect(effectiveMet(running, undefined)).toBe(7.0); // default RPE 7 → 7.0
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
    // Day 0: Pesi — Forza 40min @ RPE5 (strength flat MET 3.0)
    //      + HIIT / Intervalli 20min @ RPE5 (hiit_functional curve → MET 4.0)
    // weighted MET = (3.0*40 + 4.0*20) / 60 = (120 + 80) / 60 = 3.333 → 3.3
    const sessions = {
      "0": [
        { modality: "Pesi — Forza", duration_min: 40, rpe: 5 },
        { modality: "HIIT / Intervalli", duration_min: 20, rpe: 5 },
      ],
    };
    const result = buildTrainingSessionFromIntake(sessions, SCHEDULE_4ON_3OFF);
    expect(result).toEqual({ method: "met_value", durationMin: 60, metValue: 3.3 });
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

// ── curveKeyForEntry — taxonomy → curve coverage ─────────────────────────────

describe("curveKeyForEntry — every taxonomy entry maps to a real curve", () => {
  it("resolves every sport in the taxonomy to a defined curve", () => {
    for (const entry of SPORT_TAXONOMY) {
      const key = curveKeyForEntry(entry);
      expect(SESSION_MET_CURVES[key], `${entry.displayIt} → ${key}`).toBeDefined();
    }
  });

  it("resolves the neutral fallback to a real curve too", () => {
    expect(SESSION_MET_CURVES[curveKeyForEntry(FALLBACK_MODALITY)]).toBeDefined();
  });
});
