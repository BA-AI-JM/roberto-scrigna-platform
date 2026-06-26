/**
 * Portal plan-history scoping + getById additive fields (#portal-plan-history).
 *
 * The pure shaping/ordering is unit-tested in plan-versioning.test.ts. Here we
 * prove the two things that can only be shown end-to-end through the procedure:
 *   1. getPlanHistory is STRICTLY scoped to ctx.clientId — a different client's
 *      plans are never returned (security guarantee).
 *   2. plan.getById additively returns clientId + rootPlanId.
 * A minimal chainable fake stands in for the Supabase query builder.
 */

import { describe, test, expect, vi } from "vitest";

// The routers transitively import `server-only` (and next/headers via the server
// Supabase client); neutralise those module guards so the router can be imported
// and exercised through a caller in the vitest (non-Next) environment.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

// Fixture spanning TWO clients, mocked at the service-role layer (portal uses svc()).
const { plansByClient } = vi.hoisted(() => {
  const PLANS = [
    { id: "A1", client_id: "client-A", status: "archived", version_number: 1, version_label: "v1", parent_plan_id: null, created_at: "2026-01-01T00:00:00Z", deleted_at: null },
    { id: "A2", client_id: "client-A", status: "active", version_number: 2, version_label: "v1.1", parent_plan_id: "A1", created_at: "2026-01-05T00:00:00Z", deleted_at: null },
    { id: "B1", client_id: "client-B", status: "active", version_number: 1, version_label: "v1", parent_plan_id: null, created_at: "2026-01-09T00:00:00Z", deleted_at: null },
  ];
  // Chainable builder that records the client_id filter and resolves at .order().
  const db = {
    from: () => {
      const f: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (col: string, val: unknown) => { f[col] = val; return b; };
      b.is = () => b;
      b.order = () => Promise.resolve({ data: PLANS.filter((p) => p.client_id === f.client_id), error: null });
      return b;
    },
  };
  return { plansByClient: db };
});

vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => plansByClient,
}));

import { portalRouter } from "../portal";
import { planRouter } from "../plan";

describe("portal.getPlanHistory — strict client scoping (#portal-plan-history)", () => {
  test("returns ONLY the calling client's versions; another client's plans never appear", async () => {
    const caller = portalRouter.createCaller({ userId: "u-A", clientId: "client-A" } as never);
    const { versions } = await caller.getPlanHistory();

    expect(versions.map((v) => v.id).sort()).toEqual(["A1", "A2"]);
    expect(versions.some((v) => v.id === "B1")).toBe(false); // client-B isolated
  });

  test("client-B sees only client-B's plan", async () => {
    const caller = portalRouter.createCaller({ userId: "u-B", clientId: "client-B" } as never);
    const { versions } = await caller.getPlanHistory();
    expect(versions.map((v) => v.id)).toEqual(["B1"]);
  });

  test("newest-first ordering", async () => {
    const caller = portalRouter.createCaller({ userId: "u-A", clientId: "client-A" } as never);
    const { versions } = await caller.getPlanHistory();
    expect(versions.map((v) => v.id)).toEqual(["A2", "A1"]); // A2 created later
    expect(versions[0]!.isActive).toBe(true);
  });
});

describe("plan.getById — additive clientId + rootPlanId (#portal-plan-history)", () => {
  function ctxWith(planRow: Record<string, unknown>) {
    const supabase = {
      from: (table: string) => {
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.is = () => b;
        b.single = () =>
          Promise.resolve(
            table === "plan"
              ? { data: planRow, error: null }
              : { data: { full_name: "Mario", email: "m@x.it" }, error: null }
          );
        return b;
      },
    };
    return { userId: "u", partnerId: "partner-1", supabase } as never;
  }
  const PLAN_ID = "11111111-1111-4111-8111-111111111111";
  const ROOT_ID = "22222222-2222-4222-8222-222222222222";
  const base = {
    id: PLAN_ID, name: "Piano", status: "active", created_at: "2026-02-01T00:00:00Z",
    client_id: "cli-1", daily_targets: {}, notes: null, meals_per_day: 4,
  };

  test("a child version resolves rootPlanId to its parent + returns clientId", async () => {
    const caller = planRouter.createCaller(ctxWith({ ...base, parent_plan_id: ROOT_ID }));
    const r = await caller.getById({ id: PLAN_ID });
    expect(r.clientId).toBe("cli-1");
    expect(r.rootPlanId).toBe(ROOT_ID);
    expect(r.id).toBe(PLAN_ID); // existing fields intact (additive)
    expect(r.clientName).toBe("Mario");
  });

  test("a root plan's rootPlanId is its own id", async () => {
    const caller = planRouter.createCaller(ctxWith({ ...base, parent_plan_id: null }));
    const r = await caller.getById({ id: PLAN_ID });
    expect(r.rootPlanId).toBe(PLAN_ID);
  });
});
