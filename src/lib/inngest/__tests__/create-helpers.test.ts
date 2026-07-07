/**
 * #2 — Inngest createNotification / createTask must FAIL LOUDLY on a DB insert
 * error, not silently succeed (a swallowed insert = the coach never gets the
 * alert). Non-vacuous: the error case asserts a throw AND the success case is a
 * positive control — reverting the `if (error) throw` makes the error test pass
 * silently (no throw) → the test fails. The captured payload proves the insert ran.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  insertError: null as null | { message: string },
  lastInsert: null as { table: string; payload: Record<string, unknown> } | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: async (payload: Record<string, unknown>) => {
        state.lastInsert = { table, payload };
        return { error: state.insertError };
      },
    }),
  }),
}));

import { createNotification, createTask } from "../functions";

beforeEach(() => {
  state.insertError = null;
  state.lastInsert = null;
});

describe("createNotification", () => {
  test("resolves when the insert succeeds (positive control)", async () => {
    state.insertError = null;
    await expect(
      createNotification({ partnerId: "p1", trigger: "checkin_overdue", title: "T", body: "B" })
    ).resolves.toBeUndefined();
    expect(state.lastInsert?.table).toBe("notification");
    expect(state.lastInsert?.payload.partner_id).toBe("p1");
  });

  test("THROWS when the insert fails (no silent swallow)", async () => {
    state.insertError = { message: "duplicate key value violates unique constraint" };
    await expect(
      createNotification({ partnerId: "p1", trigger: "weight_deviation", title: "T", body: "B" })
    ).rejects.toThrow(/createNotification insert failed.*weight_deviation/);
  });
});

describe("createTask", () => {
  test("resolves when the insert succeeds (positive control)", async () => {
    state.insertError = null;
    await expect(
      createTask({ partnerId: "p1", title: "Follow up", description: "D", priority: "high" })
    ).resolves.toBeUndefined();
    expect(state.lastInsert?.table).toBe("task");
  });

  test("THROWS when the insert fails (no silent swallow)", async () => {
    state.insertError = { message: "null value in column violates not-null constraint" };
    await expect(
      createTask({ partnerId: "p1", title: "Follow up", description: "D", priority: "high" })
    ).rejects.toThrow(/createTask insert failed/);
  });
});
