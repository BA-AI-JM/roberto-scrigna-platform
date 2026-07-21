/**
 * #5/A1 — trainingSessionSchema contract.
 *
 * Pins the two halves of Roberto's "invalid" bug fix:
 * 1. kcal_override is a first-class optional session field (the old path sent
 *    it to trainingLog.setSessionKcalOverride with a composite "day:idx" id,
 *    which the uuid schema rejected on EVERY save).
 * 2. Empty-string clock times are REJECTED by the schema — which is why the
 *    editor now strips cleared time inputs to undefined instead of "".
 */
import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock("../../../lib/anthropic/client", () => ({ getAnthropic: () => ({}) }));

import { trainingSessionSchema } from "../client";

const BASE = { modality: "Pesi — Ipertrofia", duration_min: 60, rpe: 7 };

describe("trainingSessionSchema", () => {
  test("accepts Roberto's exact case: 1h session with manual 240 kcal", () => {
    const r = trainingSessionSchema.safeParse({ ...BASE, kcal_override: 240 });
    expect(r.success).toBe(true);
  });

  test("accepts a session without override (field optional)", () => {
    expect(trainingSessionSchema.safeParse(BASE).success).toBe(true);
  });

  test("rejects non-positive and absurd overrides", () => {
    expect(trainingSessionSchema.safeParse({ ...BASE, kcal_override: 0 }).success).toBe(false);
    expect(trainingSessionSchema.safeParse({ ...BASE, kcal_override: -50 }).success).toBe(false);
    expect(trainingSessionSchema.safeParse({ ...BASE, kcal_override: 10001 }).success).toBe(false);
  });

  test("rejects empty-string clock times (why the editor sends undefined)", () => {
    expect(trainingSessionSchema.safeParse({ ...BASE, startTime: "" }).success).toBe(false);
    expect(trainingSessionSchema.safeParse({ ...BASE, startTime: "18:00" }).success).toBe(true);
    expect(trainingSessionSchema.safeParse({ ...BASE, startTime: undefined }).success).toBe(true);
  });
});
