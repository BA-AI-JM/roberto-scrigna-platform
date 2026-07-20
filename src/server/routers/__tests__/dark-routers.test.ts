/**
 * T2.3 / G29 — behavioral coverage for the 5 DARK routers (Terminal-2 lane, ADDITIVE).
 *
 * Register G29 (01-CODE-GAP-REGISTER): "5 of 16 routers dark: auth, dashboard
 * (456 lines of KPI/heatmap/revenue/pipeline math), document, task, guidance —
 * zero test references." A regression in any of them ships green. This file closes
 * that gap through the tRPC caller with a chainable Supabase fake — the SAME
 * approach the sibling `client-dashboard-queries.test.ts` uses, extended to cover
 * the richer surface these routers touch: `.select(_, {count, head})`, `.in`,
 * `.lt/.lte/.gt/.gte`, `.range`, and multi-column `.order`.
 *
 * Every router gets, at minimum: (1) authz — `protectedProcedure` rejects an anon
 * caller (trpc.ts:86-92); (2) a shape assertion; (3) ≥1 real aggregation/behavioral
 * number. Nested `client:client_id (...)` joins are simulated by embedding a
 * `client` object on the fixture row (PostgREST returns exactly that; `.select()`
 * column strings are ignored by the fake, so the embed is faithful).
 */

import { describe, test, expect, vi } from "vitest";

// Routers transitively import `server-only` (+ next/headers via the server
// Supabase client); neutralise those guards for the vitest (non-Next) env.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

import { dashboardRouter } from "../dashboard";
import { authRouter } from "../auth";
import { documentRouter } from "../document";
import { taskRouter } from "../task";
import { guidanceRouter } from "../guidance";

// ── Chainable + thenable Supabase fake ────────────────────────────────────────
type Row = Record<string, unknown>;
interface Auth {
  signOut?: () => Promise<unknown>;
  signInWithPassword?: (c: { email: string; password: string }) => Promise<unknown>;
}

function makeDb(tables: Record<string, Row[]>, auth: Auth = {}) {
  const db = {
    auth: {
      signOut: auth.signOut ?? (async () => ({ error: null })),
      signInWithPassword: auth.signInWithPassword ?? (async () => ({ data: null, error: { message: "stub" } })),
    },
    from(table: string) {
      const eqs: Row = {};
      const isNulls: Row = {};
      const ins: Array<{ col: string; values: unknown[] }> = [];
      const ranges: Array<{ col: string; op: "lt" | "lte" | "gt" | "gte"; val: unknown }> = [];
      const orderCols: Array<{ col: string; asc: boolean }> = [];
      let lim: number | null = null;
      let rangeReq: { from: number; to: number } | null = null;
      let countMode = false;
      let headMode = false;

      const rowsFor = () => {
        let rows = (tables[table] ?? []).filter((r) => {
          for (const [k, v] of Object.entries(eqs)) if (r[k] !== v) return false;
          for (const [k, v] of Object.entries(isNulls)) if (v === null && (r[k] ?? null) !== null) return false;
          for (const { col, values } of ins) if (!values.includes(r[col])) return false;
          for (const { col, op, val } of ranges) {
            const rv = r[col] as string | number | null | undefined;
            if (rv == null) return false;
            if (op === "lt" && !(rv < (val as never))) return false;
            if (op === "lte" && !(rv <= (val as never))) return false;
            if (op === "gt" && !(rv > (val as never))) return false;
            if (op === "gte" && !(rv >= (val as never))) return false;
          }
          return true;
        });
        for (const { col, asc } of [...orderCols].reverse()) {
          rows = [...rows].sort((a, b) => {
            const av = a[col] as number | string, bv = b[col] as number | string;
            const c = av < bv ? -1 : av > bv ? 1 : 0;
            return asc ? c : -c;
          });
        }
        if (rangeReq) rows = rows.slice(rangeReq.from, rangeReq.to + 1);
        else if (lim != null) rows = rows.slice(0, lim);
        return rows;
      };
      const resolved = () => {
        const rows = rowsFor();
        return countMode
          ? { count: rows.length, data: headMode ? null : rows, error: null }
          : { data: rows, error: null };
      };

      const b: Row = {
        select: (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) countMode = true;
          if (opts?.head) headMode = true;
          return b;
        },
        eq: (c: string, v: unknown) => ((eqs[c] = v), b),
        is: (c: string, v: unknown) => ((isNulls[c] = v), b),
        in: (c: string, values: unknown[]) => (ins.push({ col: c, values }), b),
        lt: (c: string, v: unknown) => (ranges.push({ col: c, op: "lt", val: v }), b),
        lte: (c: string, v: unknown) => (ranges.push({ col: c, op: "lte", val: v }), b),
        gt: (c: string, v: unknown) => (ranges.push({ col: c, op: "gt", val: v }), b),
        gte: (c: string, v: unknown) => (ranges.push({ col: c, op: "gte", val: v }), b),
        order: (c: string, o?: { ascending?: boolean }) => (orderCols.push({ col: c, asc: o?.ascending ?? true }), b),
        limit: (n: number) => ((lim = n), b),
        range: (f: number, t: number) => ((rangeReq = { from: f, to: t }), b),
        single: () => {
          const r = rowsFor()[0];
          return Promise.resolve(r ? { data: r, error: null } : { data: null, error: { message: "no rows" } });
        },
        maybeSingle: () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res(resolved()),
      };
      return b;
    },
  };
  return db;
}

// ── Context helpers ───────────────────────────────────────────────────────────
const partnerCtx = (partnerId: string, db: unknown) =>
  ({ userId: "u", partnerId, clientId: null, supabase: db, headers: null } as never);
const anonCtx = (db: unknown = makeDb({})) =>
  ({ userId: null, partnerId: null, clientId: null, supabase: db, headers: null } as never);

const CA = "11111111-1111-4111-8111-111111111111";
const CB = "22222222-2222-4222-8222-222222222222";
const P1 = "p1";

// Time-anchored fixtures (avoid month/day boundary flake by deriving from `now`).
const nowIso = new Date().toISOString();
const today = nowIso.split("T")[0]!;

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — the priority (456 lines of KPI/heatmap/revenue/pipeline math).
// ═══════════════════════════════════════════════════════════════════════════
describe("dashboardRouter (G29 priority)", () => {
  const fixtures = () =>
    makeDb({
      client: [
        { id: CA, partner_id: P1, status: "active", deleted_at: null, full_name: "Aldo" },
        { id: CB, partner_id: P1, status: "active", deleted_at: null, full_name: "Bruno" },
        { id: "c3", partner_id: P1, status: "archived", deleted_at: null, full_name: "Carlo" },
        { id: "cx", partner_id: "p2", status: "active", deleted_at: null, full_name: "OtherPartner" },
      ],
      check_in: [
        { id: "ci1", partner_id: P1, status: "pending", weight_flagged: false, due_date: "2020-01-01", client: { id: CA, full_name: "Aldo" } },
        { id: "ci2", partner_id: P1, status: "completed", weight_flagged: false, completed_at: nowIso },
        { id: "ci3", partner_id: P1, status: "completed", weight_flagged: true, weight_kg: 84, weight_deviation_kg: 2.1, completed_at: nowIso, client: { id: CB, full_name: "Bruno" } },
      ],
      invoice: [
        { id: "inv1", partner_id: P1, status: "paid", amount_cents: 5000, paid_date: nowIso },
        { id: "inv2", partner_id: P1, status: "paid", amount_cents: 3000, paid_date: nowIso },
        { id: "inv3", partner_id: P1, status: "sent", amount_cents: 2000 },
      ],
      task: [
        { id: "t1", partner_id: P1, status: "todo", due_date: "2020-01-01", deleted_at: null, title: "Overdue task", client: null },
        { id: "t2", partner_id: P1, status: "todo", due_date: today, deleted_at: null, title: "Due today" },
      ],
      notification: [
        { id: "n1", partner_id: P1, read: false },
        { id: "n2", partner_id: P1, read: false },
        { id: "n3", partner_id: P1, read: true },
      ],
      training_log: [],
    });

  test("overview aggregates every KPI to the right number (real revenue sum + counts)", async () => {
    const caller = dashboardRouter.createCaller(partnerCtx(P1, fixtures()));
    const o = await caller.overview();
    expect(o.clients).toEqual({ active: 2, total: 3 }); // cx (p2) excluded by scope
    expect(o.checkins).toEqual({ pending: 1, awaitingReview: 2, flagged: 1 });
    expect(o.revenue.thisMonthCents).toBe(8000); // 5000 + 3000 paid this month
    expect(o.revenue.outstandingCents).toBe(2000); // the single 'sent' invoice
    expect(o.tasks).toEqual({ overdue: 1, dueToday: 1 });
    expect(o.notifications.unread).toBe(2);
  });

  test("alerts sorts danger before warning and stays partner-scoped", async () => {
    const caller = dashboardRouter.createCaller(partnerCtx(P1, fixtures()));
    const alerts = await caller.alerts();
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(alerts[0]!.type).toBe("danger"); // overdue pending check-in outranks warnings
    // priority order is non-decreasing (danger=0 ≤ warning=1 ≤ …).
    const order: Record<string, number> = { danger: 0, warning: 1, info: 2, success: 3 };
    for (let i = 1; i < alerts.length; i++) {
      expect(order[alerts[i]!.type]!).toBeGreaterThanOrEqual(order[alerts[i - 1]!.type]!);
    }
    expect(alerts.every((a) => a.id)).toBe(true);
  });

  test("pipelineBreakdown returns the status distribution", async () => {
    const caller = dashboardRouter.createCaller(partnerCtx(P1, fixtures()));
    const rows = await caller.pipelineBreakdown();
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    expect(byStatus).toEqual({ active: 2, paused: 0, archived: 1 });
  });

  test("engagementHeatmap returns a 12-week grid, one row per active client", async () => {
    const caller = dashboardRouter.createCaller(partnerCtx(P1, fixtures()));
    const h = await caller.engagementHeatmap();
    expect(h.weeks).toHaveLength(12);
    expect(h.data).toHaveLength(2); // 2 active clients
    for (const row of h.data) expect(row.weeks).toHaveLength(12);
  });

  test("engagementHeatmap empty-state when the partner has no active clients", async () => {
    const empty = makeDb({ client: [], check_in: [], training_log: [] });
    const caller = dashboardRouter.createCaller(partnerCtx(P1, empty));
    expect(await caller.engagementHeatmap()).toEqual({ clients: [], weeks: [], data: [] });
  });

  test("revenueTimeline returns 12 monthly buckets with this month's revenue booked", async () => {
    const caller = dashboardRouter.createCaller(partnerCtx(P1, fixtures()));
    const months = await caller.revenueTimeline();
    expect(months).toHaveLength(12);
    expect(months.at(-1)!.revenueCents).toBe(8000); // current month bucket
  });

  test("every dashboard query rejects an anonymous caller (protectedProcedure)", async () => {
    const anon = dashboardRouter.createCaller(anonCtx());
    await expect(anon.overview()).rejects.toThrow(/login/i);
    await expect(anon.alerts()).rejects.toThrow();
    await expect(anon.pipelineBreakdown()).rejects.toThrow();
    await expect(anon.engagementHeatmap()).rejects.toThrow();
    await expect(anon.revenueTimeline()).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
describe("authRouter (G29)", () => {
  const PARTNER = { id: "prt1", auth_user_id: "u", full_name: "Roberto", email: "r@x.it", role: "owner", avatar_url: null };

  test("getSession returns null for an anonymous caller", async () => {
    const caller = authRouter.createCaller(anonCtx(makeDb({ partner: [PARTNER] })));
    expect(await caller.getSession()).toBeNull();
  });

  test("getSession returns the partner row matching auth_user_id", async () => {
    const caller = authRouter.createCaller(partnerCtx("prt1", makeDb({ partner: [PARTNER] })));
    const s = await caller.getSession();
    expect(s?.id).toBe("prt1");
    expect(s?.full_name).toBe("Roberto");
  });

  test("logout is protected — anon is rejected, authed succeeds and signs out", async () => {
    const anon = authRouter.createCaller(anonCtx());
    await expect(anon.logout()).rejects.toThrow(/login/i);

    let signedOut = false;
    const db = makeDb({ partner: [PARTNER] }, { signOut: async () => ((signedOut = true), { error: null }) });
    const caller = authRouter.createCaller(partnerCtx("prt1", db));
    expect(await caller.logout()).toEqual({ success: true });
    expect(signedOut).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT
// ═══════════════════════════════════════════════════════════════════════════
describe("documentRouter (G29)", () => {
  // Ids that flow through `.uuid()` inputs (getById) must be real UUIDs.
  const D1 = "d0000001-0000-4000-8000-000000000001";
  const D2 = "d0000002-0000-4000-8000-000000000002";
  const D3 = "d0000003-0000-4000-8000-000000000003";
  const DX = "d0000004-0000-4000-8000-000000000004";
  const DOCS = [
    { id: D1, partner_id: P1, deleted_at: null, title: "Plan A", doc_type: "meal_plan", client_id: CA, created_at: "2026-01-02", client: { id: CA, full_name: "Aldo" } },
    { id: D2, partner_id: P1, deleted_at: null, title: "Report B", doc_type: "check_in_report", client_id: CB, created_at: "2026-01-05", client: { id: CB, full_name: "Bruno" } },
    { id: D3, partner_id: P1, deleted_at: "2026-02-01", title: "Deleted", doc_type: "other", created_at: "2026-01-01" }, // soft-deleted
    { id: DX, partner_id: "p2", deleted_at: null, title: "OtherPartner", doc_type: "other", created_at: "2026-01-09" },
  ];

  test("list returns only the partner's non-deleted documents", async () => {
    const caller = documentRouter.createCaller(partnerCtx(P1, makeDb({ document: DOCS })));
    const docs = await caller.list({ limit: 50, offset: 0 });
    expect(docs.map((d) => d.id).sort()).toEqual([D1, D2]); // D3 deleted, DX other partner
  });

  test("list filters by docType", async () => {
    const caller = documentRouter.createCaller(partnerCtx(P1, makeDb({ document: DOCS })));
    const docs = await caller.list({ limit: 50, offset: 0, docType: "meal_plan" });
    expect(docs.map((d) => d.id)).toEqual([D1]);
  });

  test("getById returns the scoped document; a foreign id is NOT_FOUND", async () => {
    const caller = documentRouter.createCaller(partnerCtx(P1, makeDb({ document: DOCS })));
    expect((await caller.getById({ id: D1 })).title).toBe("Plan A");
    await expect(caller.getById({ id: DX })).rejects.toThrow(/non trovato/i); // other partner
  });

  test("create rejects a clientId that belongs to another partner (cross-tenant guard)", async () => {
    const db = makeDb({ client: [{ id: CA, partner_id: "p2", deleted_at: null }], document: [] });
    const caller = documentRouter.createCaller(partnerCtx(P1, db));
    await expect(
      caller.create({ title: "X", docType: "other", fileUrl: "https://x/y.pdf", mimeType: "application/pdf", clientId: CA })
    ).rejects.toThrow(/Cliente non trovato/i);
  });

  test("mutations + reads reject an anonymous caller", async () => {
    const anon = documentRouter.createCaller(anonCtx());
    await expect(anon.list({ limit: 50, offset: 0 })).rejects.toThrow(/login/i);
    await expect(anon.getById({ id: "d0000001-0000-4000-8000-000000000001" })).rejects.toThrow();
    await expect(
      anon.create({ title: "X", docType: "other", fileUrl: "https://x/y.pdf", mimeType: "application/pdf" })
    ).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK
// ═══════════════════════════════════════════════════════════════════════════
describe("taskRouter (G29)", () => {
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0]!;
  const far = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0]!;
  const past = "2020-01-01";
  const TASKS = [
    { id: "t1", partner_id: P1, deleted_at: null, status: "todo", priority: "high", due_date: soon, title: "Soon", client: null },
    { id: "t2", partner_id: P1, deleted_at: null, status: "in_progress", priority: "medium", due_date: far, title: "Far", client: null },
    { id: "t3", partner_id: P1, deleted_at: null, status: "todo", priority: "low", due_date: past, title: "Past", client: null },
    { id: "t4", partner_id: P1, deleted_at: null, status: "done", priority: "low", due_date: soon, title: "Done", client: null },
    { id: "tx", partner_id: "p2", deleted_at: null, status: "todo", priority: "high", due_date: soon, title: "Other", client: null },
  ];

  test("list returns the partner's non-deleted tasks", async () => {
    const caller = taskRouter.createCaller(partnerCtx(P1, makeDb({ task: TASKS })));
    const rows = await caller.list({ limit: 100, offset: 0 });
    expect(rows.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3", "t4"]); // tx excluded
  });

  test("getUpcoming returns only open tasks in the [today, today+N] window", async () => {
    const caller = taskRouter.createCaller(partnerCtx(P1, makeDb({ task: TASKS })));
    const rows = await caller.getUpcoming({ daysAhead: 7 });
    // t1 (soon, todo) in-window & open; t2 (far) out of window; t3 (past) before today;
    // t4 (done) excluded by status; tx other partner.
    expect(rows.map((t) => t.id)).toEqual(["t1"]);
  });

  test("create rejects a clientId owned by another partner (cross-tenant guard)", async () => {
    const db = makeDb({ client: [{ id: CA, partner_id: "p2", deleted_at: null }], task: [] });
    const caller = taskRouter.createCaller(partnerCtx(P1, db));
    await expect(caller.create({ title: "X", status: "todo", priority: "medium", clientId: CA })).rejects.toThrow(/Cliente non trovato/i);
  });

  test("reads + mutations reject an anonymous caller", async () => {
    const anon = taskRouter.createCaller(anonCtx());
    await expect(anon.list({ limit: 100, offset: 0 })).rejects.toThrow(/login/i);
    await expect(anon.getUpcoming({ daysAhead: 7 })).rejects.toThrow();
    await expect(anon.create({ title: "X", status: "todo", priority: "medium" })).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GUIDANCE
// ═══════════════════════════════════════════════════════════════════════════
describe("guidanceRouter (G29)", () => {
  const GUIDANCE_INPUT = {
    snapshot: {
      sex: "male" as const,
      ageYears: 32,
      weightKg: 82,
      heightCm: 180,
      dailySteps: 9000,
      occupationalLevel: "sedentary" as const,
      weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"] as const,
    },
    bodyComposition: { bodyFatPct: 18, leanMassKg: 67, fatMassKg: 15 },
    dayTypes: ["training", "rest"] as const,
    trainingDaysPerWeek: 3,
    isDeficit: true,
    isSurplus: false,
    avgWeeklyTdeeKcal: 2600,
  };

  test("listAll returns all 23 block descriptors with {id,title,category}", async () => {
    const caller = guidanceRouter.createCaller(partnerCtx(P1, makeDb({})));
    const blocks = await caller.listAll();
    expect(blocks).toHaveLength(23); // the full block registry (services/guidance/blocks.ts)
    for (const b of blocks) {
      expect(b.id).toBeTruthy();
      expect(b.title).toBeTruthy();
      expect(b.category).toBeTruthy();
    }
  });

  test("select evaluates all 23 conditions — selected + excluded partition the registry", async () => {
    const caller = guidanceRouter.createCaller(partnerCtx(P1, makeDb({})));
    const res = await caller.select(GUIDANCE_INPUT);
    expect(res.count).toBe(res.blocks.length);
    expect(res.count + res.excluded.length).toBe(23); // every block is either applied or excluded
    for (const b of res.blocks) expect(b.content).toBeTruthy(); // interpolated content present
  });

  test("listDbBlocks returns the partner's custom blocks, scoped", async () => {
    const db = makeDb({
      guidance_block: [
        { id: "g1", partner_id: P1, deleted_at: null, title: "Mine", content: "c", category: "diet", sort_order: 0, created_at: "2026-01-01" },
        { id: "gx", partner_id: "p2", deleted_at: null, title: "Theirs", content: "c", category: "diet", sort_order: 0, created_at: "2026-01-01" },
      ],
    });
    const caller = guidanceRouter.createCaller(partnerCtx(P1, db));
    const rows = await caller.listDbBlocks({ limit: 100, offset: 0 });
    expect(rows.map((r) => r.id)).toEqual(["g1"]); // gx (other partner) excluded
  });

  test("every guidance procedure rejects an anonymous caller", async () => {
    const anon = guidanceRouter.createCaller(anonCtx());
    await expect(anon.listAll()).rejects.toThrow(/login/i);
    await expect(anon.select(GUIDANCE_INPUT)).rejects.toThrow();
    await expect(anon.listDbBlocks({ limit: 100, offset: 0 })).rejects.toThrow();
  });
});
