import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parsePracticeEnvelope, fetchPracticeProfile, savePracticeProfile, PracticeProfileError,
  EMPTY_PRACTICE_PROFILE, PRACTICE_FIELDS, PRACTICE_GROUPS,
} from "./practice-profile-adapter";

afterEach(() => vi.restoreAllMocks());

function mockFetch(impl: () => Partial<Response> | Promise<Partial<Response>>) {
  vi.stubGlobal("fetch", vi.fn(async () => (await impl()) as unknown as Response));
}

describe("contract shape", () => {
  it("has exactly 20 fields, all covered by the 6 groups", () => {
    expect(PRACTICE_FIELDS).toHaveLength(20);
    const grouped = PRACTICE_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
    expect(new Set(grouped)).toEqual(new Set(PRACTICE_FIELDS));
    expect(PRACTICE_GROUPS).toHaveLength(6);
    expect(Object.keys(EMPTY_PRACTICE_PROFILE)).toHaveLength(20);
  });
});

describe("parsePracticeEnvelope", () => {
  it("unwraps a superjson data.json envelope", () => {
    expect(parsePracticeEnvelope({ result: { data: { json: { foro: "Milano" } } } })).toEqual({ foro: "Milano" });
  });
  it("throws a typed error carrying the tRPC code", () => {
    expect(() => parsePracticeEnvelope({ error: { json: { message: "Vietato", data: { code: "FORBIDDEN" } } } })).toThrow(PracticeProfileError);
  });
});

describe("fetchPracticeProfile (graceful seam)", () => {
  it("returns all-null when the router is absent (non-ok)", async () => {
    mockFetch(() => ({ ok: false, status: 404, json: async () => ({}) }));
    expect(await fetchPracticeProfile()).toEqual(EMPTY_PRACTICE_PROFILE);
  });
  it("returns all-null when the fetch throws", async () => {
    mockFetch(() => { throw new Error("net"); });
    expect(await fetchPracticeProfile()).toEqual(EMPTY_PRACTICE_PROFILE);
  });
  it("normalises a partial payload to the full 20-field shape (missing → null, blank → null)", async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ result: { data: { json: { professione: "Biologo", partita_iva: "" } } } }) }));
    const p = await fetchPracticeProfile();
    expect(p.professione).toBe("Biologo");
    expect(p.partita_iva).toBeNull(); // blank → null
    expect(p.foro).toBeNull(); // missing → null
    expect(Object.keys(p)).toHaveLength(20);
  });
});

describe("savePracticeProfile", () => {
  it("sends blanks as null and succeeds on an ok envelope", async () => {
    let sentBody: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(String(init.body));
      return { ok: true, status: 200, json: async () => ({ result: { data: { json: { success: true } } } }) } as unknown as Response;
    }));
    await savePracticeProfile({ professione: "  Biologo  ", foro: "" });
    expect((sentBody as { json: Record<string, unknown> }).json.professione).toBe("Biologo"); // trimmed
    expect((sentBody as { json: Record<string, unknown> }).json.foro).toBeNull(); // blank → null
  });
  it("throws NOT_FOUND when the procedure is absent (pre-#72)", async () => {
    mockFetch(() => ({ ok: false, status: 404, json: async () => ({}) }));
    await expect(savePracticeProfile({ professione: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
