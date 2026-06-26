/**
 * Portal supplement read (#23 split-brain fix). getActivePlan must read
 * supplements from the plan bundle (daily_targets.plan_bundle.supplements) — the
 * coach-curated source — NOT the write-dead supplement_protocol relation.
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

const { activePlanDb } = vi.hoisted(() => {
  const SUPPS = [
    { name: "Creatine monohydrate", dosage: "3–6 g per day", timing: "Any time", libraryId: "creatine-monohydrate" },
    { name: "Vitamin D", dosage: "2000 IU", timing: "Morning", libraryId: "vitamin-d", notes: "with fat" },
  ];
  const planRow = {
    id: "plan-1", name: "Piano", status: "active",
    daily_targets: { plan_bundle: { reportData: { dayTypePlans: [] }, supplements: SUPPS } },
  };
  // Chainable builder resolving at .maybeSingle() (getActivePlan's terminal).
  const db = {
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.is = () => b;
      b.order = () => b;
      b.limit = () => b;
      b.maybeSingle = () => Promise.resolve({ data: planRow, error: null });
      return b;
    },
  };
  return { activePlanDb: db, SUPPS };
});

vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => activePlanDb,
}));

import { portalRouter } from "../portal";

describe("portal.getActivePlan — supplements from the bundle (#23)", () => {
  test("returns the coach-curated supplements stored in the plan bundle", async () => {
    const caller = portalRouter.createCaller({ userId: "u", clientId: "client-1" } as never);
    const plan = await caller.getActivePlan();
    expect(plan).not.toBeNull();
    expect(plan!.supplements).toHaveLength(2);
    expect(plan!.supplements.map((s) => s.libraryId)).toEqual(["creatine-monohydrate", "vitamin-d"]);
    // does NOT expose the write-dead relation
    expect((plan as unknown as Record<string, unknown>).supplement_protocol).toBeUndefined();
  });
});
