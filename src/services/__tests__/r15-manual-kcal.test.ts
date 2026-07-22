/**
 * B-eng1 / R15 (Roberto 2026-07-22): a coach's manual per-session kcal FEEDS
 * the day's expenditure — used directly, without the 0.85 MET recalibration,
 * and blended with MET sessions on a mixed day. MET-only behaviour unchanged.
 */
import { describe, test, expect } from "vitest";
import {
  buildTrainingSessionForDay,
  buildTrainingSessionFromIntake,
} from "../training-modality";
import { calculateExercise } from "../../engine/exercise";

const CTX = { weightKg: 80, ageYears: 30, sex: "male" as const };

describe("R15 — manual kcal feeds expenditure", () => {
  test("override day → final-kcal session, used directly (NO double recalibration)", () => {
    const s = buildTrainingSessionForDay(
      [{ modality: "Pesi — Forza", duration_min: 60, rpe: 5, kcal_override: 240 }],
      80,
    );
    expect(s?.method).toBe("session_estimate");
    expect(s?.finalExerciseKcal).toBe(240);
    const r = calculateExercise(s!, CTX);
    expect(r.exerciseKcal).toBe(240); // his 240 stays 240 — not 204
    expect(r.recalibrationFactor).toBe(1);
  });

  test("mixed day: override session + MET session sum correctly", () => {
    // Pesi — Forza MET 3.0 (no RPE adj) → 3.0×80×1×0.85 = 204; + override 900.
    const s = buildTrainingSessionForDay(
      [
        { modality: "BJJ — Classe", duration_min: 120, rpe: 7, kcal_override: 900 },
        { modality: "Pesi — Forza", duration_min: 60, rpe: 5 },
      ],
      80,
    );
    expect(s?.finalExerciseKcal).toBeCloseTo(1104, 0);
    expect(s?.durationMin).toBe(180);
  });

  test("no bodyweight OR no override → unchanged MET path (byte-identical)", () => {
    expect(buildTrainingSessionForDay([{ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }])?.method).toBe("met_value");
    expect(buildTrainingSessionForDay([{ modality: "Pesi — Forza", duration_min: 60, rpe: 5, kcal_override: 240 }])?.method).toBe("met_value"); // no weight
  });

  test("weekly builder honours override across training days", () => {
    const week = ["training", "rest", "training", "rest", "rest", "rest", "rest"];
    const withOverride = buildTrainingSessionFromIntake(
      { "0": [{ modality: "BJJ — Classe", duration_min: 90, rpe: 7, kcal_override: 700 }], "2": [{ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }] },
      week,
      80,
    );
    expect(withOverride?.method).toBe("session_estimate");
    // avg of day0 final (700) and day2 final (204) = 452
    expect(withOverride?.finalExerciseKcal).toBeCloseTo(452, 0);
    // same week WITHOUT weight → MET path (unchanged)
    const noWeight = buildTrainingSessionFromIntake(
      { "0": [{ modality: "BJJ — Classe", duration_min: 90, rpe: 7, kcal_override: 700 }], "2": [{ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }] },
      week,
    );
    expect(noWeight?.method).toBe("met_value");
  });
});
