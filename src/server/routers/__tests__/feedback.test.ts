/**
 * feedback.submitUrgent / getMyUrgentSubmissions (Build #28).
 *
 * Client-scoped, service-role mocked. Asserts: submission persisted + a
 * HIGH-PRIORITY ('urgent') coach notification created; injury_report stores the
 * structured fields; injury details required for injury_report; client reads only
 * own; and crucially NO plan mutation (#28 captures + notifies only).
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

const holder = vi.hoisted(() => ({
  db: null as unknown,
  inserted: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updated: [] as Array<{ table: string; set?: Record<string, unknown> }>,
}));

vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => holder.db,
}));

import { feedbackRouter } from "../feedback";

const CID = "client-A";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      const filtered = () =>
        (tables[table] ?? []).filter((r) => Object.entries(f).every(([k, v]) => r[k] === v));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        order: () => b,
        single: () =>
          Promise.resolve(
            filtered()[0]
              ? { data: filtered()[0], error: null }
              : { data: null, error: { message: "no rows" } }
          ),
        maybeSingle: () => Promise.resolve({ data: filtered()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res({ data: filtered(), error: null }),
        insert: (payload: Record<string, unknown>) => {
          holder.inserted.push({ table, payload });
          const ret = { id: `${table}-new`, created_at: "2026-06-30T10:00:00Z", ...payload };
          return {
            select: () => ({ single: () => Promise.resolve({ data: ret, error: null }) }),
            then: (res: (v: unknown) => unknown) => res({ data: null, error: null }),
          };
        },
        update: (set: Record<string, unknown>) => {
          holder.updated.push({ table, set });
          const u: Record<string, unknown> = {
            eq: () => u,
            then: (res: (v: unknown) => unknown) => res({ error: null }),
          };
          return u;
        },
      };
      return b;
    },
  };
}

const caller = (clientId = CID) =>
  feedbackRouter.createCaller({ userId: "u", clientId } as never);
const partnerCaller = (db: unknown, partnerId = "p1") =>
  feedbackRouter.createCaller({ userId: "u", partnerId, supabase: db } as never);

beforeEach(() => {
  holder.inserted = [];
  holder.updated = [];
  holder.db = makeDb({
    client: [{ id: CID, partner_id: "p1", full_name: "Mario Rossi" }],
    urgent_feedback: [],
    notification: [],
  });
});

describe("feedback.submitUrgent", () => {
  test("urgent_feedback: persists the submission AND creates a HIGH-PRIORITY coach notification", async () => {
    const res = await caller().submitUrgent({
      kind: "urgent_feedback",
      message: "Mi sento molto stanco e ho saltato i pasti.",
    });
    expect(res.status).toBe("open");
    expect(res.kind).toBe("urgent_feedback");

    const sub = holder.inserted.find((i) => i.table === "urgent_feedback")!;
    expect(sub.payload).toMatchObject({
      client_id: CID,
      partner_id: "p1",
      kind: "urgent_feedback",
      status: "open",
    });

    const notif = holder.inserted.find((i) => i.table === "notification")!;
    expect(notif.payload).toMatchObject({
      partner_id: "p1",
      client_id: CID,
      trigger: "urgent_feedback",
      priority: "urgent", // surfaces in the #2 feed
    });
  });

  test("injury_report: stores the structured injury fields", async () => {
    await caller().submitUrgent({
      kind: "injury_report",
      message: "Dolore al ginocchio durante la corsa.",
      injury: {
        area: "ginocchio destro",
        severity: "moderato",
        onsetDate: "2026-06-28",
        limitations: "non posso correre",
      },
    });
    const sub = holder.inserted.find((i) => i.table === "urgent_feedback")!;
    expect(sub.payload).toMatchObject({
      kind: "injury_report",
      injury_area: "ginocchio destro",
      injury_severity: "moderato",
      injury_onset: "2026-06-28",
      limitations: "non posso correre",
    });
    // injury context propagated to the coach notification metadata
    const notif = holder.inserted.find((i) => i.table === "notification")!;
    expect((notif.payload.metadata as Record<string, unknown>).injuryArea).toBe("ginocchio destro");
  });

  test("injury_report WITHOUT injury details is rejected at validation (BAD_REQUEST, no write)", async () => {
    // Assert the CODE, not just any throw — a missing refine would instead throw a
    // downstream TypeError (INTERNAL_SERVER_ERROR), so a bare toThrow() is vacuous.
    await expect(
      caller().submitUrgent({ kind: "injury_report", message: "mi sono fatto male" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(holder.inserted).toHaveLength(0);
  });

  test("an impossible onsetDate (2026-02-31) is rejected at validation", async () => {
    await expect(
      caller().submitUrgent({
        kind: "injury_report",
        message: "infortunio",
        injury: { area: "caviglia", severity: "lieve", onsetDate: "2026-02-31" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(holder.inserted).toHaveLength(0);
  });

  test("empty message is rejected", async () => {
    await expect(
      caller().submitUrgent({ kind: "urgent_feedback", message: "" })
    ).rejects.toThrow();
    expect(holder.inserted).toHaveLength(0);
  });

  test("NEVER mutates the plan (captures + notifies only)", async () => {
    await caller().submitUrgent({ kind: "urgent_feedback", message: "nota urgente" });
    // exactly the two intended INSERTs, and ZERO updates of any table (catches a
    // regen via plan or any plan-adjacent UPDATE).
    expect(holder.inserted.map((i) => i.table).sort()).toEqual(["notification", "urgent_feedback"]);
    expect(holder.updated).toHaveLength(0);
  });
});

describe("feedback partner procedures", () => {
  const CUID = "22222222-2222-4222-8222-222222222222";
  const partnerDb = () =>
    makeDb({
      // same client_id, DIFFERENT partner — so the partner scope is what discriminates.
      urgent_feedback: [
        { id: "u1", client_id: CUID, partner_id: "p1", kind: "urgent_feedback", message: "m1", status: "open", created_at: "2026-06-30T09:00:00Z" },
        { id: "u2", client_id: CUID, partner_id: "pOther", kind: "urgent_feedback", message: "m2", status: "open", created_at: "2026-06-30T08:00:00Z" },
      ],
    });

  test("getClientUrgentSubmissions returns only the coach's OWN client rows (partner scope)", async () => {
    const list = (await partnerCaller(partnerDb(), "p1").getClientUrgentSubmissions({
      clientId: CUID,
    })) as Array<{ id: string }>;
    expect(list).toHaveLength(1); // only u1 (partner p1), not u2 (pOther)
    expect(list[0]!.id).toBe("u1");
  });

  test("markAddressed updates status scoped to the partner", async () => {
    const res = await partnerCaller(partnerDb(), "p1").markAddressed({
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(res.success).toBe(true);
    const upd = holder.updated.find((u) => u.table === "urgent_feedback")!;
    expect(upd.set).toEqual({ status: "addressed" });
  });
});

describe("feedback.getMyUrgentSubmissions", () => {
  test("returns only the caller's own submissions, with status + injury shape", async () => {
    holder.db = makeDb({
      urgent_feedback: [
        { id: "u1", client_id: CID, kind: "injury_report", message: "m1", status: "open", created_at: "2026-06-30T09:00:00Z", injury_area: "spalla", injury_severity: "lieve", injury_onset: "2026-06-29", limitations: null },
        { id: "u2", client_id: "client-OTHER", kind: "urgent_feedback", message: "m2", status: "open", created_at: "2026-06-30T08:00:00Z", injury_area: null },
      ],
    });
    const list = await caller(CID).getMyUrgentSubmissions();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("u1");
    expect(list[0]!.injury).toMatchObject({ area: "spalla", severity: "lieve", onsetDate: "2026-06-29" });
  });
});
