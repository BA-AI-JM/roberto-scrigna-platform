/**
 * Urgent-feedback seam adapter — envelope parsing + submit/list wrappers (mocked fetch).
 */
import { describe, test, expect, vi, afterEach } from "vitest";
import {
  parseUrgentEnvelope,
  submitUrgentFeedback,
  fetchMyUrgentSubmissions,
  UrgentFeedbackError,
} from "../urgent-feedback-adapter";
import type { UrgentSubmission } from "../types";

const SUB: UrgentSubmission = { id: "s1", kind: "feedback", message: "ciao", status: "aperto", createdAt: "2026-06-20T10:00:00Z" };

describe("parseUrgentEnvelope", () => {
  test("unwraps superjson + plain, throws typed error", () => {
    expect(parseUrgentEnvelope({ result: { data: { json: SUB } } })).toEqual(SUB);
    expect(parseUrgentEnvelope({ result: { data: SUB } })).toEqual(SUB);
    expect(() => parseUrgentEnvelope({ error: { json: { message: "no", data: { code: "FORBIDDEN" } } } })).toThrow(UrgentFeedbackError);
  });
});

describe("submitUrgentFeedback", () => {
  afterEach(() => vi.unstubAllGlobals());
  test("POSTs the input as a superjson body and returns the created submission", async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ result: { data: { json: SUB } } }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const out = await submitUrgentFeedback({ kind: "feedback", message: "ciao" });
    expect(out).toEqual(SUB);
    const call = spy.mock.calls[0]!;
    expect(String(call[0])).toContain("feedback.submitUrgent");
    expect(call[1]?.method).toBe("POST");
    expect(JSON.parse(call[1]!.body as string)).toEqual({ json: { kind: "feedback", message: "ciao" } });
  });
  test("maps a server error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { json: { message: "bad", data: { code: "BAD_REQUEST" } } } }), { status: 400 })));
    await expect(submitUrgentFeedback({ kind: "feedback", message: "ciao" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("fetchMyUrgentSubmissions", () => {
  afterEach(() => vi.unstubAllGlobals());
  test("returns the list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { data: { json: [SUB] } } }), { status: 200 })));
    await expect(fetchMyUrgentSubmissions()).resolves.toEqual([SUB]);
  });
  test("coerces a non-array payload to []", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { data: { json: {} } } }), { status: 200 })));
    await expect(fetchMyUrgentSubmissions()).resolves.toEqual([]);
  });
});
