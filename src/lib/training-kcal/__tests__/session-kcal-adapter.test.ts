import { describe, test, expect, vi, afterEach } from "vitest";
import { setSessionKcalOverride, SessionKcalError } from "../session-kcal-adapter";

describe("setSessionKcalOverride", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("POSTs { sessionId, kcalOverride } as a superjson body", async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ result: { data: { json: null } } }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await setSessionKcalOverride("0:1", 350);
    const call = spy.mock.calls[0]!;
    expect(String(call[0])).toContain("trainingLog.setSessionKcalOverride");
    expect(call[1]?.method).toBe("POST");
    expect(JSON.parse(call[1]!.body as string)).toEqual({ json: { sessionId: "0:1", kcalOverride: 350 } });
  });

  test("clearing sends kcalOverride: null", async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ result: { data: { json: null } } }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await setSessionKcalOverride("0:1", null);
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({ json: { sessionId: "0:1", kcalOverride: null } });
  });

  test("throws a typed error on a server error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { json: { message: "no", data: { code: "FORBIDDEN" } } } }), { status: 403 })));
    await expect(setSessionKcalOverride("0:1", 350)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("throws on a non-JSON failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    await expect(setSessionKcalOverride("0:1", 350)).rejects.toBeInstanceOf(SessionKcalError);
  });

  test("does NOT report success on a non-OK status whose JSON body lacks an error field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ json: null }), { status: 400 })));
    await expect(setSessionKcalOverride("0:1", 350)).rejects.toBeInstanceOf(SessionKcalError);
  });
});
