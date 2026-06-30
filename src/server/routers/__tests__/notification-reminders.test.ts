/**
 * notification.getReminderSettings / updateReminderSettings (Build #07).
 *
 * Partner-scoped, via ctx.supabase (mocked). Asserts: defaults when unset; saved
 * values when set; range validation; partner-scope denial (can't touch another
 * partner's client); the upsert payload.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

const holder = vi.hoisted(() => ({
  upserts: [] as Array<{
    table: string;
    payload: Record<string, unknown>;
    opts?: Record<string, unknown>;
  }>,
}));

import { notificationRouter } from "../notification";

const CID = "22222222-2222-4222-8222-222222222222";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      const filtered = () =>
        (tables[table] ?? []).filter((r) => Object.entries(f).every(([k, v]) => r[k] === v));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        is: (c: string, v: unknown) => ((f[c] = v), b),
        maybeSingle: () => Promise.resolve({ data: filtered()[0] ?? null, error: null }),
        single: () =>
          Promise.resolve(
            filtered()[0]
              ? { data: filtered()[0], error: null }
              : { data: null, error: { message: "no rows" } }
          ),
        upsert: (payload: Record<string, unknown>, opts?: Record<string, unknown>) => ({
          then: (res: (v: unknown) => unknown) => {
            holder.upserts.push({ table, payload, opts });
            return res({ error: null });
          },
        }),
      };
      return b;
    },
  };
}

const caller = (db: unknown, partnerId = "p1") =>
  notificationRouter.createCaller({ userId: "u", partnerId, supabase: db } as never);

beforeEach(() => {
  holder.upserts = [];
});

// ── getReminderSettings ─────────────────────────────────────────────────────────
describe("notification.getReminderSettings", () => {
  test("returns DEFAULTS (21 / 0 / enabled) when the client has no settings row", async () => {
    const db = makeDb({
      client: [{ id: CID, partner_id: "p1", deleted_at: null }],
      client_reminder_settings: [],
    });
    const res = await caller(db).getReminderSettings({ clientId: CID });
    expect(res).toEqual({ checkInEveryDays: 21, bodyCompEveryDays: 0, enabled: true });
  });

  test("returns the SAVED values when a settings row exists", async () => {
    const db = makeDb({
      client: [{ id: CID, partner_id: "p1", deleted_at: null }],
      client_reminder_settings: [
        { client_id: CID, check_in_every_days: 14, body_comp_every_days: 30, reminders_enabled: false },
      ],
    });
    const res = await caller(db).getReminderSettings({ clientId: CID });
    expect(res).toEqual({ checkInEveryDays: 14, bodyCompEveryDays: 30, enabled: false });
  });

  test("DENIES another partner's client (partner scope)", async () => {
    const db = makeDb({
      client: [{ id: CID, partner_id: "p2", deleted_at: null }], // belongs to p2
      client_reminder_settings: [],
    });
    await expect(caller(db, "p1").getReminderSettings({ clientId: CID })).rejects.toThrow();
  });

  test("DENIES a soft-deleted client (deleted_at guard)", async () => {
    const db = makeDb({
      client: [{ id: CID, partner_id: "p1", deleted_at: "2026-06-01T00:00:00Z" }],
      client_reminder_settings: [],
    });
    await expect(caller(db).getReminderSettings({ clientId: CID })).rejects.toThrow();
  });
});

// ── updateReminderSettings ────────────────────────────────────────────────────────
describe("notification.updateReminderSettings", () => {
  test("upserts the cadence and returns it", async () => {
    const db = makeDb({ client: [{ id: CID, partner_id: "p1", deleted_at: null }] });
    const res = await caller(db).updateReminderSettings({
      clientId: CID,
      checkInEveryDays: 14,
      bodyCompEveryDays: 28,
      enabled: true,
    });
    expect(res).toMatchObject({ success: true, checkInEveryDays: 14, bodyCompEveryDays: 28, enabled: true });
    const up = holder.upserts.find((u) => u.table === "client_reminder_settings")!;
    expect(up.payload).toMatchObject({
      client_id: CID,
      check_in_every_days: 14,
      body_comp_every_days: 28,
      reminders_enabled: true,
    });
    // Upsert keys on client_id (UNIQUE) so a second save updates, not duplicates.
    expect(up.opts).toMatchObject({ onConflict: "client_id" });
  });

  test.each([
    ["body-comp 0 = off", { checkInEveryDays: 21, bodyCompEveryDays: 0, enabled: true }],
    ["check-in min boundary 1", { checkInEveryDays: 1, bodyCompEveryDays: 0, enabled: true }],
    ["check-in max boundary 90", { checkInEveryDays: 90, bodyCompEveryDays: 0, enabled: true }],
    ["body-comp max boundary 90", { checkInEveryDays: 21, bodyCompEveryDays: 90, enabled: true }],
  ])("accepts in-range %s", async (_label, vals) => {
    const db = makeDb({ client: [{ id: CID, partner_id: "p1", deleted_at: null }] });
    await expect(
      caller(db).updateReminderSettings({ clientId: CID, ...vals })
    ).resolves.toMatchObject({ success: true });
  });

  test.each([
    ["checkInEveryDays = 0", { checkInEveryDays: 0, bodyCompEveryDays: 0, enabled: true }],
    ["checkInEveryDays = 91", { checkInEveryDays: 91, bodyCompEveryDays: 0, enabled: true }],
    ["bodyCompEveryDays = 91", { checkInEveryDays: 21, bodyCompEveryDays: 91, enabled: true }],
    ["bodyCompEveryDays = -1", { checkInEveryDays: 21, bodyCompEveryDays: -1, enabled: true }],
  ])("rejects out-of-range %s", async (_label, vals) => {
    const db = makeDb({ client: [{ id: CID, partner_id: "p1", deleted_at: null }] });
    await expect(
      caller(db).updateReminderSettings({ clientId: CID, ...vals })
    ).rejects.toThrow();
    expect(holder.upserts).toHaveLength(0);
  });

  test("DENIES updating another partner's client (no upsert)", async () => {
    const db = makeDb({ client: [{ id: CID, partner_id: "p2", deleted_at: null }] });
    await expect(
      caller(db, "p1").updateReminderSettings({ clientId: CID, checkInEveryDays: 14, bodyCompEveryDays: 0, enabled: true })
    ).rejects.toThrow();
    expect(holder.upserts).toHaveLength(0);
  });

  test("DENIES updating a soft-deleted client (no upsert)", async () => {
    const db = makeDb({ client: [{ id: CID, partner_id: "p1", deleted_at: "2026-06-01T00:00:00Z" }] });
    await expect(
      caller(db).updateReminderSettings({ clientId: CID, checkInEveryDays: 14, bodyCompEveryDays: 0, enabled: true })
    ).rejects.toThrow();
    expect(holder.upserts).toHaveLength(0);
  });
});
