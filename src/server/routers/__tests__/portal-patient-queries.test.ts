/**
 * #27 Stage 3 — patient-facing portal queries: scoping + photo round-trip.
 *
 * Proven end-to-end through a clientProcedure caller with a chainable fake
 * service-role Supabase (portal uses svc()). The security guarantee is that each
 * read is STRICTLY scoped to ctx.clientId — another client's docs/notifications
 * never appear. addSnapshot persists the new progress-photo URLs.
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

const holder = vi.hoisted(() => ({
  db: null as unknown,
  inserted: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));
vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => holder.db,
}));

import { portalRouter } from "../portal";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      let orderCol: string | null = null;
      let orderAsc = true;
      let lim: number | null = null;
      let isCount = false;
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
      const result = () => (isCount ? { data: null, count: filtered().length, error: null } : { data: rows(), error: null });
      const b: Record<string, unknown> = {
        select: (_cols?: unknown, opts?: { head?: boolean }) => { if (opts?.head) isCount = true; return b; },
        insert: (payload: Record<string, unknown>) => {
          holder.inserted.push({ table, payload });
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "new-id" }, error: null }) }) };
        },
        eq: (c: string, v: unknown) => { f[c] = v; return b; },
        is: (c: string, v: unknown) => { f[c] = v; return b; }, // e.g. .is("deleted_at", null)
        order: (c: string, o?: { ascending?: boolean }) => { orderCol = c; orderAsc = o?.ascending ?? true; return b; },
        limit: (n: number) => { lim = n; return b; },
        single: () => Promise.resolve({ data: rows()[0] ?? null, error: rows()[0] ? null : { message: "no rows" } }),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res(result()),
      };
      return b;
    },
  };
}

const caller = (clientId: string) => portalRouter.createCaller({ userId: "u", clientId } as never);

// ── getDocuments ─────────────────────────────────────────────────────────────
describe("portal.getDocuments — strict client scoping (#27)", () => {
  const DOCS = [
    { id: "d1", client_id: "cA", title: "Piano A", doc_type: "meal_plan", file_url: "u1", deleted_at: null, created_at: "2026-01-02" },
    { id: "d2", client_id: "cA", title: "Report A", doc_type: "progress_report", file_url: "u2", deleted_at: null, created_at: "2026-01-05" },
    { id: "d3", client_id: "cA", title: "Old A", doc_type: "other", file_url: "u3", deleted_at: "2026-01-06", created_at: "2026-01-01" },
    { id: "d4", client_id: "cB", title: "Piano B", doc_type: "meal_plan", file_url: "u4", deleted_at: null, created_at: "2026-01-09" },
  ];

  test("returns only the caller's own non-deleted documents, newest-first", async () => {
    holder.db = makeDb({ document: DOCS });
    const { documents } = await caller("cA").getDocuments();
    expect(documents.map((d) => d.id)).toEqual(["d2", "d1"]); // newest-first, deleted d3 excluded
    expect(documents.some((d) => d.id === "d4")).toBe(false); // client-B's doc never appears
  });

  test("client-B sees only client-B's document", async () => {
    holder.db = makeDb({ document: DOCS });
    const { documents } = await caller("cB").getDocuments();
    expect(documents.map((d) => d.id)).toEqual(["d4"]);
  });
});

// ── getNotifications ─────────────────────────────────────────────────────────
describe("portal.getNotifications — strict client scoping + unread count (#27)", () => {
  const NOTIFS = [
    { id: "n1", client_id: "cA", trigger: "plan_expiring", read: false, created_at: "2026-01-03" },
    { id: "n2", client_id: "cA", trigger: "checkin_completed", read: true, created_at: "2026-01-05" },
    { id: "n3", client_id: "cA", trigger: "weight_deviation", read: false, created_at: "2026-01-08" },
    { id: "n4", client_id: "cB", trigger: "plan_expiring", read: false, created_at: "2026-01-09" },
  ];

  test("returns only the caller's notifications newest-first with an unread count", async () => {
    holder.db = makeDb({ notification: NOTIFS });
    const { notifications, unreadCount } = await caller("cA").getNotifications();
    expect(notifications.map((n) => n.id)).toEqual(["n3", "n2", "n1"]); // newest-first, only cA
    expect(notifications.some((n) => n.id === "n4")).toBe(false); // client-B excluded
    expect(unreadCount).toBe(2); // n1 + n3
  });

  test("unreadOnly filters to unread", async () => {
    holder.db = makeDb({ notification: NOTIFS });
    const { notifications } = await caller("cA").getNotifications({ unreadOnly: true });
    expect(notifications.map((n) => n.id)).toEqual(["n3", "n1"]);
  });
});

// ── addSnapshot photo round-trip ─────────────────────────────────────────────
describe("portal.addSnapshot — progress-photo round-trip + scoping (#27)", () => {
  test("persists the three photo URLs scoped to the caller's client_id", async () => {
    holder.db = makeDb({ client_snapshot: [] });
    holder.inserted = [];
    await caller("cA").addSnapshot({
      weightKg: 81,
      photoFrontUrl: "client-photos/p/cA/front.jpg",
      photoSideUrl: "client-photos/p/cA/side.jpg",
      photoBackUrl: "client-photos/p/cA/back.jpg",
    });
    const row = holder.inserted.find((i) => i.table === "client_snapshot")!.payload;
    expect(row.client_id).toBe("cA"); // scoped to caller
    expect(row.photo_front_url).toBe("client-photos/p/cA/front.jpg");
    expect(row.photo_side_url).toBe("client-photos/p/cA/side.jpg");
    expect(row.photo_back_url).toBe("client-photos/p/cA/back.jpg");
    expect(row.weight_kg).toBe(81);
  });

  test("omitting photos stores null (additive — existing callers unaffected)", async () => {
    holder.db = makeDb({ client_snapshot: [] });
    holder.inserted = [];
    await caller("cA").addSnapshot({ weightKg: 80 });
    const row = holder.inserted.find((i) => i.table === "client_snapshot")!.payload;
    expect(row.photo_front_url).toBeNull();
    expect(row.photo_side_url).toBeNull();
    expect(row.photo_back_url).toBeNull();
  });
});
