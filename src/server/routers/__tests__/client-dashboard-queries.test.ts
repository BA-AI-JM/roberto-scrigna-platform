/**
 * #2 client-dashboard enabler queries — scoping + compute.
 *
 * Three additive read procedures proven end-to-end through a caller with a
 * minimal chainable fake Supabase (the pure shaping lives in the engine; here we
 * prove the things only visible through the procedure):
 *   - notification.getForClient: partner-scoped + filtered to one client.
 *   - checkin.getLatestCompleted: latest completed for the scoped client,
 *     including review_notes; cross-partner isolation.
 *   - client.estimateTdee: per-distinct-day-type energy breakdown, no plan.
 */

import { describe, test, expect, vi } from "vitest";

// Routers transitively import `server-only` (+ next/headers via the server
// Supabase client); neutralise those guards for the vitest (non-Next) env.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

import { notificationRouter } from "../notification";
import { checkinRouter } from "../checkin";
import { clientRouter } from "../client";

/**
 * Minimal chainable + thenable Supabase fake. Records `.eq()` filters, honours
 * `.order()`/`.limit()`, and resolves via `.then` (await), `.single`, or
 * `.maybeSingle` against a per-table dataset.
 */
function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      let orderCol: string | null = null;
      let orderAsc = true;
      let lim: number | null = null;
      const rowsFor = () => {
        let rows = (tables[table] ?? []).filter((r) =>
          Object.entries(f).every(([k, v]) => r[k] === v)
        );
        if (orderCol) {
          const col = orderCol;
          rows = [...rows].sort((a, b) => {
            const av = a[col] as number | string, bv = b[col] as number | string;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }
        if (lim != null) rows = rows.slice(0, lim);
        return rows;
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => { f[c] = v; return b; },
        is: () => b,
        order: (c: string, o?: { ascending?: boolean }) => { orderCol = c; orderAsc = o?.ascending ?? true; return b; },
        limit: (n: number) => { lim = n; return b; },
        maybeSingle: () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null }),
        single: () => {
          const r = rowsFor()[0];
          return Promise.resolve(r ? { data: r, error: null } : { data: null, error: { message: "no rows" } });
        },
        then: (res: (v: { data: unknown; error: null }) => unknown) => res({ data: rowsFor(), error: null }),
      };
      return b;
    },
  };
}

const ctx = (partnerId: string, db: ReturnType<typeof makeDb>) =>
  ({ userId: "u", partnerId, supabase: db } as never);

// clientId inputs are validated as UUIDs; partner ids are ctx-only (not validated).
const CA = "11111111-1111-4111-8111-111111111111";
const CB = "22222222-2222-4222-8222-222222222222";

// ── notification.getForClient ────────────────────────────────────────────────
describe("notification.getForClient — partner + client scoping (#2)", () => {
  const NOTIFS = [
    { id: "n1", partner_id: "p1", client_id: CA, trigger: "weight_deviation", read: false, created_at: "2026-01-03" },
    { id: "n2", partner_id: "p1", client_id: CA, trigger: "checkin_completed", read: true, created_at: "2026-01-02" },
    { id: "n3", partner_id: "p1", client_id: CB, trigger: "plan_expiring", read: false, created_at: "2026-01-04" },
    { id: "n4", partner_id: "p2", client_id: CA, trigger: "weight_deviation", read: false, created_at: "2026-01-05" },
  ];

  test("returns only the given client's notifications under the caller's partner", async () => {
    const caller = notificationRouter.createCaller(ctx("p1", makeDb({ notification: NOTIFS })));
    const { notifications } = await caller.getForClient({ clientId: CA });
    expect(notifications.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
    expect(notifications.some((n) => n.id === "n3")).toBe(false); // other client
    expect(notifications.some((n) => n.id === "n4")).toBe(false); // other partner
  });

  test("a different partner sees nothing for that client (cross-partner isolation)", async () => {
    const caller = notificationRouter.createCaller(ctx("p2", makeDb({ notification: NOTIFS })));
    const { notifications } = await caller.getForClient({ clientId: CA });
    expect(notifications.map((n) => n.id)).toEqual(["n4"]); // only p2's own row for cA
  });

  test("unreadOnly filters to unread", async () => {
    const caller = notificationRouter.createCaller(ctx("p1", makeDb({ notification: NOTIFS })));
    const { notifications } = await caller.getForClient({ clientId: CA, unreadOnly: true });
    expect(notifications.map((n) => n.id)).toEqual(["n1"]);
  });
});

// ── checkin.getLatestCompleted ───────────────────────────────────────────────
describe("checkin.getLatestCompleted — latest completed, scoped, with review_notes (#2)", () => {
  const CHECKINS = [
    { id: "c1", partner_id: "p1", client_id: CA, status: "completed", completed_at: "2026-01-02", ai_summary: "old", review_notes: "rev-old" },
    { id: "c2", partner_id: "p1", client_id: CA, status: "completed", completed_at: "2026-01-09", ai_summary: "latest", review_notes: "rev-latest" },
    { id: "c3", partner_id: "p1", client_id: CA, status: "pending", completed_at: null },
    { id: "c4", partner_id: "p1", client_id: CB, status: "completed", completed_at: "2026-01-20", ai_summary: "other-client" },
    { id: "c5", partner_id: "p2", client_id: CA, status: "completed", completed_at: "2026-01-25", ai_summary: "other-partner" },
  ];

  test("returns the newest COMPLETED check-in for the scoped client incl review_notes", async () => {
    const caller = checkinRouter.createCaller(ctx("p1", makeDb({ check_in: CHECKINS })));
    const { checkin } = await caller.getLatestCompleted({ clientId: CA });
    expect(checkin?.id).toBe("c2");
    expect(checkin?.ai_summary).toBe("latest");
    expect(checkin?.review_notes).toBe("rev-latest"); // the field list omits
  });

  test("never returns another client's or another partner's check-in", async () => {
    const caller = checkinRouter.createCaller(ctx("p2", makeDb({ check_in: CHECKINS })));
    const { checkin } = await caller.getLatestCompleted({ clientId: CA });
    expect(checkin?.id).toBe("c5"); // p2's own row for cA, not c2/c4
  });

  test("no completed check-in → null", async () => {
    const caller = checkinRouter.createCaller(ctx("p1", makeDb({ check_in: [CHECKINS[2]!] })));
    const { checkin } = await caller.getLatestCompleted({ clientId: CA });
    expect(checkin).toBeNull();
  });
});

// ── client.estimateTdee ──────────────────────────────────────────────────────
describe("client.estimateTdee — per-day-type breakdown, no plan (#2)", () => {
  const SNAPSHOT = {
    client_id: CA,
    taken_at: "2026-01-01",
    age_years: 32,
    weight_kg: 82,
    height_cm: 180,
    daily_steps: 9000,
    occupational_level: "sedentary",
    week_schedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
    skinfold_data: { method: "override", bodyFatPctOverride: 18, _intake: {} },
  };
  const db = () => makeDb({ client: [{ id: CA, partner_id: "p1", sex: "male" }], client_snapshot: [SNAPSHOT] });

  test("returns one breakdown per DISTINCT day-type with the full TDEE shape", async () => {
    const caller = clientRouter.createCaller(ctx("p1", db()));
    const { weekSchedule, byDayType } = await caller.estimateTdee({ clientId: CA });
    expect(weekSchedule).toHaveLength(7);
    expect(byDayType.map((d) => d.dayType).sort()).toEqual(["rest", "training"]);
    for (const d of byDayType) {
      expect(d.bmr).toBeGreaterThan(0);
      expect(d.neat.totalNeatKcal).toBeGreaterThan(0);
      expect(d.tef).toBeGreaterThan(0);
      expect(d.totalTdeeKcal).toBeGreaterThan(0);
      expect(d.exercise).toHaveProperty("methodUsed");
    }
    const training = byDayType.find((d) => d.dayType === "training")!;
    const rest = byDayType.find((d) => d.dayType === "rest")!;
    expect(training.exercise.exerciseKcal).toBeGreaterThan(0);
    expect(rest.exercise.exerciseKcal).toBe(0);
    expect(training.totalTdeeKcal).toBeGreaterThan(rest.totalTdeeKcal); // exercise adds
  });

  test("a client not under the caller's partner → NOT_FOUND (scoping)", async () => {
    const caller = clientRouter.createCaller(ctx("p2", db()));
    await expect(caller.estimateTdee({ clientId: CA })).rejects.toThrow();
  });
});
