/**
 * T1.8 golden — the serialize→decode seam guards NUMBERS, not just shape.
 * (Engine-output pins live in the fidelity tier; this file owns the transport seam
 * that dropped waterLoading for a month while every test stayed green — G11.)
 */
import { describe, it, expect } from "vitest";
import {
  serializePlanResult,
  PLAN_BUNDLE_SCHEMA_VERSION,
  type PlanGenerationResult,
} from "../services/plan-generator";
import { parsePlanBundle, PlanBundleDecodeError } from "../lib/plan-bundle";

function realisticResult(): PlanGenerationResult {
  const mealPlans = new Map<string, unknown>();
  mealPlans.set("training", {
    dayType: "training",
    withinTolerance: true,
    targetMacros: { proteinG: 208, fatG: 82, carbG: 400, totalKcal: 3170 },
    actualMacros: { proteinG: 209.3, fatG: 66.6, carbsG: 418, kcal: 3103 },
    slots: [{ slot: "breakfast", primary: { actualMacros: { kcal: 772, proteinG: 53, carbsG: 110, fatG: 13 } } }],
    deviation: { proteinG: 1.3, fatG: -15.4, carbsG: 18, kcal: -67 },
  });
  return {
    reportData: { dayTypePlans: [{ dayType: "training", label: "Allenamento" }] },
    weeklyPlan: { days: [{ dayType: "training", tdee: { totalTdeeKcal: 3168 } }] },
    bodyComposition: { leanMassKg: 83.1, bodyFatPct: 13.2, bmrKcal: 1418 },
    mealPlans,
    supplements: [{ name: "Creatina", dose: "5 g" }],
    guidance: { sections: [] },
    monitoring: { cadenceDays: 21 },
    energyBalance: "maintenance",
    assumptions: ["Grasso corporeo stimato con J&P 7 pliche"],
    waterLoading: { protocolDays: 5, litersByDay: [7, 6, 5, 3, 1] },
  } as unknown as PlanGenerationResult;
}

describe("plan_bundle seam (T1.8/G11)", () => {
  it("v2 round-trip: version stamped, waterLoading carried, every number identical", () => {
    const serialized = serializePlanResult(realisticResult());
    expect(serialized.schemaVersion).toBe(PLAN_BUNDLE_SCHEMA_VERSION);
    const { version, bundle } = parsePlanBundle(JSON.parse(JSON.stringify(serialized)));
    expect(version).toBe(2);
    expect(bundle.waterLoading).toEqual({ protocolDays: 5, litersByDay: [7, 6, 5, 3, 1] });
    const mp = (bundle.mealPlans as unknown as Record<string, { targetMacros: Record<string, number>; actualMacros: Record<string, number>; deviation: Record<string, number> }>)["training"]!;
    expect(mp.targetMacros).toEqual({ proteinG: 208, fatG: 82, carbG: 400, totalKcal: 3170 });
    expect(mp.actualMacros).toEqual({ proteinG: 209.3, fatG: 66.6, carbsG: 418, kcal: 3103 });
    expect(mp.deviation).toEqual({ proteinG: 1.3, fatG: -15.4, carbsG: 18, kcal: -67 });
    expect((bundle.bodyComposition as unknown as Record<string, number>).leanMassKg).toBe(83.1);
  });

  it("v1 legacy row (no version, no waterLoading) parses as version 1 with numbers intact", () => {
    const serialized = serializePlanResult(realisticResult()) as unknown as Record<string, unknown>;
    delete serialized.schemaVersion;
    delete serialized.waterLoading;
    const { version, bundle } = parsePlanBundle(JSON.parse(JSON.stringify(serialized)));
    expect(version).toBe(1);
    expect(bundle.waterLoading).toBeUndefined();
    const mp = (bundle.mealPlans as unknown as Record<string, { actualMacros: Record<string, number> }>)["training"]!;
    expect(mp.actualMacros.proteinG).toBe(209.3);
  });

  it("malformed bundles throw a typed decode error — never silent, never 'not found'", () => {
    expect(() => parsePlanBundle({})).toThrow(PlanBundleDecodeError);
    expect(() => parsePlanBundle(null)).toThrow(PlanBundleDecodeError);
    expect(() => parsePlanBundle({ reportData: {}, weeklyPlan: {}, mealPlans: {}, energyBalance: "diet", assumptions: [] })).toThrow(PlanBundleDecodeError);
  });
});
