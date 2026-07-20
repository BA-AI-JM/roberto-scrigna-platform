import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => holder.db,
}));

import { clientRouter } from "../client";

const KEY = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_ID = "33333333-3333-4333-8333-333333333333";

const input = {
  idempotencyKey: KEY,
  client: { fullName: "Mario Rossi" },
  snapshot: {},
};

function caller() {
  return clientRouter.createCaller({
    userId: "user-1",
    partnerId: "partner-1",
    supabase: { from: vi.fn(() => { throw new Error("direct table write attempted"); }) },
  } as never);
}

describe("client.submitIntakeForm — transactional RPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("replaying the same key returns the original ids without direct duplicate inserts", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ client_id: CLIENT_ID, snapshot_id: SNAPSHOT_ID, was_replay: false, invalid_reason: null }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ client_id: CLIENT_ID, snapshot_id: SNAPSHOT_ID, was_replay: true, invalid_reason: null }],
        error: null,
      });
    holder.db = { rpc };

    const first = await caller().submitIntakeForm(input);
    const replay = await caller().submitIntakeForm(input);

    expect(first).toEqual({ clientId: CLIENT_ID, snapshotId: SNAPSHOT_ID, wasReplay: false });
    expect(replay).toEqual({ clientId: CLIENT_ID, snapshotId: SNAPSHOT_ID, wasReplay: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "intake_create_client_with_snapshot", expect.objectContaining({
      p_partner_id: "partner-1",
      p_idempotency_key: KEY,
    }));
  });

  test("a snapshot failure is surfaced and never falls back to an orphaning client insert", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ client_id: null, snapshot_id: null, was_replay: false, invalid_reason: "snapshot_failed" }],
      error: null,
    });
    holder.db = { rpc };

    await expect(caller().submitIntakeForm(input)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(rpc).toHaveBeenCalledOnce();
  });
});
