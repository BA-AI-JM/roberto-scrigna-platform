/**
 * Supplement default-zero (#23). New plans seed ZERO supplements (Roberto's
 * explicit default — auto-assignment removed); the supplementOverrides opt-in
 * path still passes through. generatePlan is a pure pipeline (no DB), so this is
 * a direct call, not a mocked procedure.
 */

import { describe, test, expect } from "vitest";
import { generatePlan } from "../plan-generator";
import type { ClientSnapshot } from "../../engine/types";
import type { PdfClientInfo } from "../../pdf/types";

const snapshot: ClientSnapshot = {
  sex: "male",
  ageYears: 31,
  weightKg: 82,
  heightCm: 178,
  bodyFatPctOverride: 16,
  dailySteps: 8000,
  occupationalLevel: "sedentary",
  weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
};
const clientInfo: PdfClientInfo = { fullName: "Test Atleta", planDate: "2026-06-26" };

describe("supplement default-zero (#23)", () => {
  test("a new plan seeds ZERO supplements", () => {
    const result = generatePlan({ clientInfo, snapshot });
    expect(result.supplements).toEqual([]);
  });

  test("supplementOverrides still pass through (opt-in path preserved)", () => {
    const overrides = [
      {
        name: "Creatine monohydrate",
        dosage: "3–6 g per day",
        timing: "Any time",
        libraryId: "creatine-monohydrate",
      },
    ];
    const result = generatePlan({ clientInfo, snapshot, supplementOverrides: overrides });
    expect(result.supplements).toEqual(overrides);
  });
});
