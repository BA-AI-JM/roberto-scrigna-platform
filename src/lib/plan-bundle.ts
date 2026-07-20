/**
 * T1.8 (G11) — the ONE decoder every plan_bundle consumer goes through.
 *
 * plan.daily_targets.plan_bundle is an overloaded JSONB carrier read by four
 * surfaces (PDF, portal, review/getById, version replay). Before this module,
 * each consumer cast it unchecked — a shape change silently mis-rendered or
 * 42x-ed at runtime (the 262g-class risk lives on this seam; NORTHSTAR clause:
 * "nothing lost"). Zod guards STRUCTURE here; the golden fixtures
 * (plan-bundle-golden.test.ts) guard the NUMBERS.
 *
 * Versioning: v1 = every row written before 2026-07-20 (no schemaVersion, no
 * waterLoading — the engine computed the combat-sport water protocol and v1
 * serialization dropped it). v2 adds both. Parsing is deliberately tolerant
 * (.passthrough()) on fields this module does not own — it validates the
 * load-bearing surface, it does not re-model the world.
 */
import { z } from "zod";
import type { SerializedPlanResult } from "../services/plan-generator";

export class PlanBundleDecodeError extends Error {
  constructor(reason: string) {
    super(`plan_bundle decode failed: ${reason}`);
    this.name = "PlanBundleDecodeError";
  }
}

const macrosShape = z
  .object({
    proteinG: z.number().optional(),
    fatG: z.number().optional(),
    carbsG: z.number().optional(),
    carbG: z.number().optional(),
    kcal: z.number().optional(),
    totalKcal: z.number().optional(),
  })
  .passthrough();

const bundleSchema = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    waterLoading: z.unknown().optional(),
    reportData: z.object({ dayTypePlans: z.array(z.unknown()) }).passthrough(),
    weeklyPlan: z.object({ days: z.array(z.unknown()) }).passthrough(),
    mealPlans: z.record(
      z.string(),
      z
        .object({
          slots: z.array(z.unknown()),
          targetMacros: macrosShape.optional(),
          actualMacros: macrosShape.optional(),
        })
        .passthrough()
    ),
    energyBalance: z.enum(["deficit", "surplus", "maintenance"]),
    assumptions: z.array(z.string()),
  })
  .passthrough();

export type ParsedPlanBundle = {
  version: number;
  bundle: SerializedPlanResult;
};

/**
 * Decode a raw plan_bundle value. Throws PlanBundleDecodeError on structural
 * failure — consumers surface that as INTERNAL (a real error), never as
 * "plan not found" (the G31 conflation this arc buried).
 */
export function parsePlanBundle(raw: unknown): ParsedPlanBundle {
  if (raw == null || typeof raw !== "object") {
    throw new PlanBundleDecodeError("bundle missing or not an object");
  }
  const result = bundleSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new PlanBundleDecodeError(
      `${first?.path?.join(".") || "(root)"}: ${first?.message || "invalid"}`
    );
  }
  return {
    version: result.data.schemaVersion ?? 1,
    bundle: result.data as unknown as SerializedPlanResult,
  };
}

/** Non-throwing variant for surfaces that degrade visibly instead of erroring. */
export function tryParsePlanBundle(raw: unknown): ParsedPlanBundle | null {
  try {
    return parsePlanBundle(raw);
  } catch {
    return null;
  }
}
