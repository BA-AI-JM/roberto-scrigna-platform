import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({
  service: null as unknown,
}));

vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => holder.service,
}));

import { gdprRouter } from "../gdpr";

const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_USER_ID = "33333333-3333-4333-8333-333333333333";

const caller = () =>
  gdprRouter.createCaller({
    userId: "authenticated-partner",
    partnerId: PARTNER_ID,
  } as never);

function makeService(options?: {
  storageRemoveError?: string;
  authDeleteError?: string;
  storageRemoveThrows?: string;
  authDeleteThrows?: string;
}) {
  const aggregate = {
    client: { id: CLIENT_ID, full_name: "Mario Rossi" },
    client_snapshot: [{ id: "snapshot-1", client_id: CLIENT_ID }],
    check_in: [{ id: "checkin-1", client_id: CLIENT_ID }],
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === "gdpr_export_client") return { data: aggregate, error: null };
    return {
      data: [{ erased: true, tables_touched: 11, invalid_reason: null }],
      error: null,
    };
  });
  const list = vi.fn(async (prefix: string) => ({
    data: prefix.startsWith("client-photos")
      ? [{ name: "front.jpg" }]
      : [{ name: "workout.png" }],
    error: null,
  }));
  const remove = vi.fn(async () => {
    if (options?.storageRemoveThrows) throw new Error(options.storageRemoveThrows);
    return {
      data: options?.storageRemoveError ? null : [],
      error: options?.storageRemoveError
        ? { message: options.storageRemoveError }
        : null,
    };
  });
  const deleteUser = vi.fn(async () => {
    if (options?.authDeleteThrows) throw new Error(options.authDeleteThrows);
    return {
      data: options?.authDeleteError ? null : { user: null },
      error: options?.authDeleteError ? { message: options.authDeleteError } : null,
    };
  });

  return {
    aggregate,
    rpc,
    list,
    remove,
    deleteUser,
    service: {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { auth_user_id: AUTH_USER_ID },
                error: null,
              }),
            }),
          }),
        }),
      }),
      storage: { from: () => ({ list, remove }) },
      auth: { admin: { deleteUser } },
    },
  };
}

beforeEach(() => {
  holder.service = makeService().service;
});

describe("gdpr.exportClient", () => {
  test("returns the complete aggregate produced by the export RPC", async () => {
    const fixture = makeService();
    holder.service = fixture.service;

    await expect(caller().exportClient({ clientId: CLIENT_ID })).resolves.toEqual(
      fixture.aggregate
    );
    expect(fixture.rpc).toHaveBeenCalledWith("gdpr_export_client", {
      p_partner_id: PARTNER_ID,
      p_client_id: CLIENT_ID,
    });
  });
});

describe("gdpr.eraseClient", () => {
  test("rejects unless confirm is exactly ERASE", async () => {
    await expect(
      caller().eraseClient({ clientId: CLIENT_ID, confirm: "erase" } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("reports the database, storage, and auth outcomes independently", async () => {
    const fixture = makeService({
      storageRemoveError: "storage unavailable",
      authDeleteError: "auth unavailable",
    });
    holder.service = fixture.service;

    const result = await caller().eraseClient({
      clientId: CLIENT_ID,
      confirm: "ERASE",
    });

    expect(result.database).toEqual({
      erased: true,
      tablesTouched: 11,
      invalidReason: null,
    });
    expect(result.storage).toEqual({
      success: false,
      removedObjects: 0,
      error: "storage unavailable",
    });
    expect(result.auth).toEqual({
      attempted: true,
      success: false,
      error: "auth unavailable",
    });
    expect(fixture.remove).toHaveBeenCalledWith([
      `client-photos/${PARTNER_ID}/${CLIENT_ID}/front.jpg`,
      `training-screenshots/${PARTNER_ID}/${CLIENT_ID}/workout.png`,
    ]);
    expect(fixture.deleteUser).toHaveBeenCalledWith(AUTH_USER_ID);
  });

  test("reports thrown storage and auth failures instead of losing either outcome", async () => {
    const fixture = makeService({
      storageRemoveThrows: "storage threw",
      authDeleteThrows: "auth threw",
    });
    holder.service = fixture.service;

    await expect(
      caller().eraseClient({ clientId: CLIENT_ID, confirm: "ERASE" })
    ).resolves.toMatchObject({
      storage: { success: false, error: "storage threw" },
      auth: { attempted: true, success: false, error: "auth threw" },
    });
  });
});

describe("021 GDPR migration", () => {
  test("exports every client-data table explicitly without dynamic SQL", () => {
    const sql = readFileSync(
      new URL("../../../../supabase/migrations/021_gdpr_mechanism.sql", import.meta.url),
      "utf8"
    );
    const requiredKeys = [
      "client",
      "client_snapshot",
      "check_in",
      "diary_entry",
      "training_log",
      "plan",
      "invoice",
      "document",
      "message",
      "notification",
      "signature_request",
      "legal_document",
      "legal_document_version",
      "snapshot_edit_audit",
      "urgent_feedback",
      "client_reminder_settings",
      "consent_record",
      "client_media",
    ];

    for (const key of requiredKeys) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).not.toMatch(/\bEXECUTE\s+(?:FORMAT\s*\(|['"])/i);
  });
});
