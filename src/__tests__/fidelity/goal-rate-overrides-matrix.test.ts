/**
 * Fidelity matrix for the May 2026 goal-rate and absolute macro-override features.
 *
 * The target-rate result feeds the daily-plan deficit/surplus input, then the
 * macro engine runs both its formula path and its absolute-protein path.
 */

import {
  generateDailyPlan,
  type ClientSnapshot,
  type TdeeOverride,
} from "../../engine/index";
import { computeGoalRate } from "../../engine/goal-rate";

interface MatrixCase {
  athlete: string;
  direction: "deficit" | "surplus";
  override: "no-override" | "protein-override";
  snapshot: ClientSnapshot;
  trainingTdeeKcal: number;
  tdeeOverride?: TdeeOverride;
  targetKg: number;
  weeks: number;
  leanMassKg: number;
  proteinOverrideG: number;
  expected: { proteinG: number; fatG: number; carbG: number; totalKcal: number };
}

const marco: ClientSnapshot = {
  sex: "male",
  ageYears: 31,
  weightKg: 82,
  heightCm: 178,
  bodyFatPctOverride: 16,
  dailySteps: 8000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

const niccolo: ClientSnapshot = {
  sex: "male",
  ageYears: 28,
  weightKg: 75,
  heightCm: 180,
  bodyFatPctOverride: 14,
  dailySteps: 10000,
  occupationalLevel: "light",
  weekSchedule: ["training", "training", "rest", "training", "rest", "training", "rest"],
};

const raphael: ClientSnapshot = {
  sex: "male",
  ageYears: 35,
  weightKg: 90,
  heightCm: 183,
  bodyFatPctOverride: 18,
  dailySteps: 7000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};

const athleteScenarios = [
  {
    athlete: "Marco Bellini",
    snapshot: marco,
    trainingTdeeKcal: 2627,
    tdeeOverride: undefined,
    leanMassKg: 68.88,
    proteinOverrideG: 180,
    deficit: { targetKg: 78, weeks: 12 },
    surplus: { targetKg: 85, weeks: 16 },
    expected: {
      deficit: {
        "no-override": { proteinG: 172, fatG: 74, carbG: 227, totalKcal: 2262 },
        "protein-override": { proteinG: 180, fatG: 74, carbG: 219, totalKcal: 2262 },
      },
      surplus: {
        "no-override": { proteinG: 172, fatG: 74, carbG: 370, totalKcal: 2834 },
        "protein-override": { proteinG: 180, fatG: 74, carbG: 362, totalKcal: 2834 },
      },
    },
  },
  {
    athlete: "Niccolo",
    snapshot: niccolo,
    trainingTdeeKcal: 2600,
    tdeeOverride: { dayType: "training", tdeeKcal: 2600 },
    leanMassKg: 64.5,
    proteinOverrideG: 170,
    deficit: { targetKg: 72, weeks: 12 },
    surplus: { targetKg: 78, weeks: 16 },
    expected: {
      deficit: {
        "no-override": { proteinG: 161, fatG: 68, carbG: 267, totalKcal: 2324 },
        "protein-override": { proteinG: 170, fatG: 68, carbG: 258, totalKcal: 2324 },
      },
      surplus: {
        "no-override": { proteinG: 161, fatG: 68, carbG: 388, totalKcal: 2808 },
        "protein-override": { proteinG: 170, fatG: 68, carbG: 379, totalKcal: 2808 },
      },
    },
  },
  {
    athlete: "Raphael",
    snapshot: raphael,
    trainingTdeeKcal: 2650,
    tdeeOverride: { dayType: "training", tdeeKcal: 2650 },
    leanMassKg: 73.8,
    proteinOverrideG: 195,
    deficit: { targetKg: 84, weeks: 16 },
    surplus: { targetKg: 94, weeks: 20 },
    expected: {
      deficit: {
        "no-override": { proteinG: 185, fatG: 81, carbG: 192, totalKcal: 2237 },
        "protein-override": { proteinG: 195, fatG: 81, carbG: 182, totalKcal: 2237 },
      },
      surplus: {
        "no-override": { proteinG: 185, fatG: 81, carbG: 350, totalKcal: 2869 },
        "protein-override": { proteinG: 195, fatG: 81, carbG: 340, totalKcal: 2869 },
      },
    },
  },
] as const;

const matrixCases: MatrixCase[] = athleteScenarios.flatMap((athlete) =>
  (["deficit", "surplus"] as const).flatMap((direction) =>
    (["no-override", "protein-override"] as const).map((override) => ({
      athlete: athlete.athlete,
      direction,
      override,
      snapshot: athlete.snapshot,
      trainingTdeeKcal: athlete.trainingTdeeKcal,
      ...(athlete.tdeeOverride ? { tdeeOverride: athlete.tdeeOverride } : {}),
      targetKg: athlete[direction].targetKg,
      weeks: athlete[direction].weeks,
      leanMassKg: athlete.leanMassKg,
      proteinOverrideG: athlete.proteinOverrideG,
      expected: athlete.expected[direction][override],
    }))
  )
);

describe("Goal-rate × absolute-overrides fidelity matrix", () => {
  // (pinned from engine @ HEAD 2026-07-20)
  test.each(matrixCases)(
    "$athlete — $direction — $override pins P/F/C/kcal",
    ({
      snapshot,
      trainingTdeeKcal,
      tdeeOverride,
      targetKg,
      weeks,
      leanMassKg,
      override,
      proteinOverrideG,
      expected,
    }) => {
      const goalRate = computeGoalRate({
        currentKg: snapshot.weightKg,
        targetKg,
        weeks,
        tdeeKcal: trainingTdeeKcal,
        leanMassKg,
      });
      const plan = generateDailyPlan(snapshot, "training", {
        ...(tdeeOverride ? { overrides: [tdeeOverride] } : {}),
        dailyDeficitKcal: goalRate.dailyDeficitKcal,
        ...(override === "protein-override"
          ? {
              macroOptions: {
                absoluteOverrides: { training: { proteinG: proteinOverrideG } },
              },
            }
          : {}),
      });

      expect({
        proteinG: plan.macros.proteinG,
        fatG: plan.macros.fatG,
        carbG: plan.macros.carbG,
        totalKcal: plan.macros.totalKcal,
      }).toEqual(expected);
    }
  );
});
