/**
 * Fidelity golden: No-HR RPE-MET curve → full plan (end-to-end wiring).
 *
 * The existing marco-bellini fidelity uses the 300-kcal default_estimate, so it
 * never exercises the curve path. This golden threads a session built through the
 * REAL intake builder (buildTrainingSessionForDay → met_value curve session) all
 * the way through calculateTdee → target → macros, and pins every number so any
 * future regression in the expenditure→plan chain is caught at the plan level.
 *
 * Body: 82 kg male, BF 16% → LBM 68.88 kg (same intermediates as marco:
 * BMR 1858 Katch, NEAT 328, TEF 186). Only the exercise term changes with the sport.
 */
import { describe, it, expect } from "vitest";
import {
  generateDailyPlan,
  generateWeeklyPlan,
  calculateTdee,
  type ClientSnapshot,
} from "../../engine/index";
import { buildTrainingSessionForDay } from "../../services/training-modality";

const luca: ClientSnapshot = {
  sex: "male",
  ageYears: 31,
  weightKg: 82,
  heightCm: 178,
  bodyFatPctOverride: 16,
  dailySteps: 8000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

// Built through the real intake path — this is exactly what the router produces.
const bjjSession = buildTrainingSessionForDay(
  [{ modality: "BJJ — Classe", duration_min: 90, rpe: 7 }],
  82
)!;
const strengthSession = buildTrainingSessionForDay(
  [{ modality: "Pesi — Forza", duration_min: 75, rpe: 5 }],
  82
)!;

describe("No-HR curve → full plan (golden, end-to-end)", () => {
  it("the intake builder emits a curve-based met_value session (BJJ RPE7 → 3.2)", () => {
    expect(bjjSession).toEqual({ method: "met_value", durationMin: 90, metValue: 3.2 });
  });

  it("training-day TDEE composes the curve exercise with NO 0.85", () => {
    const tdee = calculateTdee(luca, "training", { trainingSession: bjjSession });
    expect(tdee.exercise.exerciseKcal).toBe(394); // 3.2×82×1.5, no recalibration
    expect(tdee.exercise.methodUsed).toBe("met_value");
    expect(tdee.exercise.recalibrationFactor).toBe(1);
    // BMR 1858 + NEAT 328 + exercise 394 + TEF 186 = 2766
    expect(tdee.totalTdeeKcal).toBe(2766);
  });

  it("daily training plan macros are carb-led off the curve TDEE", () => {
    const plan = generateDailyPlan(luca, "training", { trainingSession: bjjSession });
    expect(plan.tdee.totalTdeeKcal).toBe(2766);
    expect(plan.macros.proteinG).toBe(172); // 2.5 × LBM 68.88 (body-fixed)
    expect(plan.macros.fatG).toBe(74); // 0.9 × 82 (body-fixed)
    expect(plan.macros.carbG).toBe(353); // remainder absorbs the higher expenditure
    expect(plan.macros.totalKcal).toBe(2766);
  });

  it("strength flows through the plan at flat MET 3.0, also no 0.85", () => {
    expect(strengthSession).toEqual({ method: "met_value", durationMin: 75, metValue: 3.0 });
    const tdee = calculateTdee(luca, "training", { trainingSession: strengthSession });
    expect(tdee.exercise.exerciseKcal).toBe(308); // 3.0×82×1.25, no 0.85
    // BMR 1858 + NEAT 328 + 308 + TEF 186 = 2680
    expect(tdee.totalTdeeKcal).toBe(2680);
  });

  it("weekly plan threads the session on training days only, rest days = 0", () => {
    const perDay = luca.weekSchedule.map((d) => (d === "training" ? bjjSession : null));
    const weekly = generateWeeklyPlan(luca, { perDayTrainingSession: perDay });
    expect(weekly.days).toHaveLength(7);
    expect(weekly.days[0]!.tdee.exercise.exerciseKcal).toBe(394);
    expect(weekly.days[0]!.tdee.totalTdeeKcal).toBe(2766);
    expect(weekly.days[1]!.tdee.exercise.exerciseKcal).toBe(0); // rest
    expect(weekly.days[2]!.tdee.totalTdeeKcal).toBe(2766);
    expect(weekly.days[4]!.tdee.totalTdeeKcal).toBe(2766);
  });
});
