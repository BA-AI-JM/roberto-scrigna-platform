/**
 * Reminder-settings seam adapter — envelope parsing, error mapping, and the
 * fetch/save wrappers (mocked global fetch). No network.
 */
import { describe, test, expect, vi, afterEach } from "vitest";
import {
  parseReminderEnvelope,
  fetchReminderSettings,
  saveReminderSettings,
  ReminderSettingsError,
} from "../reminder-settings-adapter";
import type { ReminderSettings } from "../types";

const SETTINGS: ReminderSettings = { checkInEveryDays: 14, bodyCompEveryDays: 28, enabled: true };

describe("parseReminderEnvelope", () => {
  test("unwraps superjson result and a plain result", () => {
    expect(parseReminderEnvelope({ result: { data: { json: SETTINGS } } })).toEqual(SETTINGS);
    expect(parseReminderEnvelope({ result: { data: SETTINGS } })).toEqual(SETTINGS);
  });
  test("throws a typed error carrying the tRPC code", () => {
    try {
      parseReminderEnvelope({ error: { json: { message: "no", data: { code: "FORBIDDEN" } } } });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ReminderSettingsError);
      expect((e as ReminderSettingsError).code).toBe("FORBIDDEN");
    }
  });
});

describe("fetchReminderSettings", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("returns settings on a 200 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { data: { json: SETTINGS } } }), { status: 200 })));
    await expect(fetchReminderSettings("c1")).resolves.toEqual(SETTINGS);
  });

  test("throws FORBIDDEN on a 403 error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { json: { message: "no", data: { code: "FORBIDDEN" } } } }), { status: 403 }))
    );
    await expect(fetchReminderSettings("c1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("saveReminderSettings", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("POSTs the input as a superjson body and returns the saved settings", async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ result: { data: { json: SETTINGS } } }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const out = await saveReminderSettings({ clientId: "c1", ...SETTINGS });
    expect(out).toEqual(SETTINGS);
    const call = spy.mock.calls[0]!;
    expect(String(call[0])).toContain("notification.updateReminderSettings");
    expect(call[1]?.method).toBe("POST");
    expect(JSON.parse(call[1]!.body as string)).toEqual({ json: { clientId: "c1", ...SETTINGS } });
  });

  test("surfaces a server range error (BAD_REQUEST)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { json: { message: "range", data: { code: "BAD_REQUEST" } } } }), { status: 400 }))
    );
    await expect(saveReminderSettings({ clientId: "c1", ...SETTINGS })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
