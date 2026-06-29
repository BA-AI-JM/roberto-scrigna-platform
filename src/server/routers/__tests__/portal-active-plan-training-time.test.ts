/**
 * #18 → portal: portal.getActivePlan exposes the client's representative
 * training time (from the latest snapshot's _intake.training_sessions) so the
 * patient can render the same timed peri-workout box the coach sees.
 *
 * Proven through a clientProcedure caller with a chainable fake service-role
 * Supabase. ADDITIVE: existing fields (mealPlan, supplements) are preserved;
 * absent training time degrades gracefully to {} (no box).
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => holder.db,
}));

import { portalRouter } from "../portal";

// Minimal chainable fake supporting the getActivePlan chains:
//   plan:           select.eq.eq.is.order.limit.maybeSingle
//   client_snapshot select.eq.order.limit.maybeSingle
function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      let orderCol: string | null = null;
      let orderAsc = true;
      let lim: number | null = null;
      const filtered = () => (tables[table] ?? []).filter((r) => Object.entries(f).every(([k, v]) => r[k] === v));
      const rows = () => {
        let r = filtered();
        if (orderCol) {
          const c = orderCol;
          r = [...r].sort((a, b) => {
            const av = a[c] as number | string, bv = b[c] as number | string;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }
        if (lim != null) r = r.slice(0, lim);
        return r;
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => { f[c] = v; return b; },
        is: (c: string, v: unknown) => { f[c] = v; return b; },
        order: (c: string, o?: { ascending?: boolean }) => { orderCol = c; orderAsc = o?.ascending ?? true; return b; },
        limit: (n: number) => { lim = n; return b; },
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      };
      return b;
    },
  };
}

const caller = (clientId: string) => portalRouter.createCaller({ userId: "u", clientId } as never);

const PLAN = {
  id: "p1",
  client_id: "cA",
  status: "active",
  deleted_at: null,
  created_at: "2026-01-01",
  name: "Piano A",
  daily_targets: null,
};

describe("portal.getActivePlan — #18 training-time exposure", () => {
  test("returns the representative training time from the NEWEST snapshot", async () => {
    holder.db = makeDb({
      plan: [PLAN],
      client_snapshot: [
        { id: "old", client_id: "cA", taken_at: "2026-01-01", skinfold_data: { _intake: { training_sessions: { "0": [{ startTime: "07:00" }] } } } },
        { id: "new", client_id: "cA", taken_at: "2026-06-01", skinfold_data: { _intake: { training_sessions: { "2": [{ startTime: "18:00", endTime: "19:30" }] } } } },
      ],
    });
    const res = await caller("cA").getActivePlan();
    expect(res?.trainingTime).toEqual({ startTime: "18:00", endTime: "19:30" });
  });

  test("missing training_sessions → empty object (graceful, no box)", async () => {
    holder.db = makeDb({
      plan: [PLAN],
      client_snapshot: [{ id: "s1", client_id: "cA", taken_at: "2026-06-01", skinfold_data: { _intake: {} } }],
    });
    const res = await caller("cA").getActivePlan();
    expect(res?.trainingTime).toEqual({});
  });

  test("no snapshot at all → empty training time (graceful)", async () => {
    holder.db = makeDb({ plan: [PLAN], client_snapshot: [] });
    const res = await caller("cA").getActivePlan();
    expect(res?.trainingTime).toEqual({});
  });

  test("ADDITIVE — existing fields (mealPlan, supplements) still present", async () => {
    holder.db = makeDb({ plan: [PLAN], client_snapshot: [] });
    const res = await caller("cA").getActivePlan();
    expect(res).toMatchObject({ id: "p1", name: "Piano A" });
    expect(Array.isArray(res?.mealPlan)).toBe(true);
    expect(Array.isArray(res?.supplements)).toBe(true);
  });
});
