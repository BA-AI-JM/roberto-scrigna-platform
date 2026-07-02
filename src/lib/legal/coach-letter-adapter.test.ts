import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseCoachLetterEnvelope,
  letterStatusBadge,
  fetchClientLetterStatus,
  downloadSignedForClient,
  CoachLetterError,
  NO_LETTER,
} from "./coach-letter-adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(impl: () => Promise<Partial<Response>> | Partial<Response>) {
  vi.stubGlobal("fetch", vi.fn(async () => impl() as unknown as Response));
}

describe("parseCoachLetterEnvelope", () => {
  it("unwraps a superjson data.json envelope", () => {
    expect(parseCoachLetterEnvelope({ result: { data: { json: { status: "signed" } } } })).toEqual({ status: "signed" });
  });
  it("unwraps a plain data envelope", () => {
    expect(parseCoachLetterEnvelope({ result: { data: { status: "pending" } } })).toEqual({ status: "pending" });
  });
  it("throws a typed CoachLetterError carrying the tRPC code", () => {
    try {
      parseCoachLetterEnvelope({ error: { json: { message: "Vietato", data: { code: "FORBIDDEN" } } } });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CoachLetterError);
      expect((e as CoachLetterError).code).toBe("FORBIDDEN");
      expect((e as CoachLetterError).message).toBe("Vietato");
    }
  });
  it("throws PARSE_ERROR when the payload is null", () => {
    expect(() => parseCoachLetterEnvelope({ result: { data: { json: null } } })).toThrow(CoachLetterError);
  });
});

describe("letterStatusBadge", () => {
  it("maps signed → Firmata (green)", () => {
    expect(letterStatusBadge("signed").label).toBe("Firmata");
  });
  it("maps pending/sent/viewed → In attesa di firma", () => {
    expect(letterStatusBadge("pending").label).toBe("In attesa di firma");
    expect(letterStatusBadge("SENT").label).toBe("In attesa di firma"); // case-insensitive
    expect(letterStatusBadge("viewed").label).toBe("In attesa di firma");
  });
  it("maps declined → Rifiutata and unknown/none → Non inviata", () => {
    expect(letterStatusBadge("declined").label).toBe("Rifiutata");
    expect(letterStatusBadge("none").label).toBe("Non inviata");
    expect(letterStatusBadge("wat").label).toBe("Non inviata");
  });
});

describe("fetchClientLetterStatus (graceful seam)", () => {
  it("returns NO_LETTER when the fetch throws (procedure absent)", async () => {
    mockFetch(() => {
      throw new Error("network");
    });
    expect(await fetchClientLetterStatus("c1")).toEqual(NO_LETTER);
  });
  it("returns NO_LETTER on a non-ok response (procedure not present yet)", async () => {
    mockFetch(() => ({ ok: false, status: 404, json: async () => ({}) }));
    expect(await fetchClientLetterStatus("c1")).toEqual(NO_LETTER);
  });
  it("parses a real status envelope when the procedure responds", async () => {
    const payload = { status: "signed", requestId: "r1", signedAt: "2026-06-01", versionLabel: "v1" };
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ result: { data: { json: payload } } }) }));
    expect(await fetchClientLetterStatus("c1")).toEqual(payload);
  });
});

describe("downloadSignedForClient", () => {
  it("returns the parsed document payload", async () => {
    const doc = { pdfBase64: "AAAA", mimeType: "application/pdf", filename: "x.pdf" };
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ result: { data: { json: doc } } }) }));
    expect(await downloadSignedForClient("r1")).toEqual(doc);
  });
  it("throws FORBIDDEN on a 403", async () => {
    mockFetch(() => ({ ok: false, status: 403, json: async () => ({}) }));
    await expect(downloadSignedForClient("r1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
