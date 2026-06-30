/**
 * Data-seam adapter — URL encoding, superjson-envelope parsing, error mapping,
 * and the fetch wrapper (mocked global fetch). No network.
 */
import { describe, test, expect, vi, afterEach } from "vitest";
import {
  signatureDocumentUrl,
  parseSignatureDocumentEnvelope,
  fetchSignatureDocument,
  SignatureDocumentError,
} from "../fetch-signature-document";
import type { SignatureDocument } from "../types";

const DOC: SignatureDocument = {
  requestId: "11111111-1111-1111-1111-111111111111",
  status: "pending",
  documentName: "Lettera d'incarico",
  versionNumber: 1,
  versionLabel: "v1",
  language: "it",
  contentHash: "abc123",
  bodyMd: "# Titolo\n\nTesto **grassetto** e [PLACEHOLDER:firma].",
  practitionerName: "Roberto Scrigna",
  patientName: "Mario Rossi",
  missingTokens: ["{{codice_fiscale}}"],
  pendingPlaceholders: ["[PLACEHOLDER:firma]"],
};

describe("signatureDocumentUrl", () => {
  test("encodes a superjson { json: { requestId } } input", () => {
    const url = signatureDocumentUrl("req-1");
    expect(url.startsWith("/api/trpc/signature.getSignatureDocument?input=")).toBe(true);
    const input = JSON.parse(decodeURIComponent(url.split("input=")[1]!));
    expect(input).toEqual({ json: { requestId: "req-1" } });
  });
});

describe("parseSignatureDocumentEnvelope", () => {
  test("unwraps a superjson result ({ result: { data: { json } } })", () => {
    expect(parseSignatureDocumentEnvelope({ result: { data: { json: DOC } } })).toEqual(DOC);
  });

  test("tolerates a plain result ({ result: { data } })", () => {
    expect(parseSignatureDocumentEnvelope({ result: { data: DOC } })).toEqual(DOC);
  });

  test("throws a typed error carrying the tRPC code", () => {
    try {
      parseSignatureDocumentEnvelope({ error: { json: { message: "Richiesta non trovata.", data: { code: "NOT_FOUND" } } } });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SignatureDocumentError);
      expect((e as SignatureDocumentError).code).toBe("NOT_FOUND");
    }
  });

  test("throws PARSE_ERROR on a malformed payload", () => {
    expect(() => parseSignatureDocumentEnvelope({ result: { data: { json: null } } })).toThrow(SignatureDocumentError);
  });
});

describe("fetchSignatureDocument", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("returns the document on a 200 superjson response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: { data: { json: DOC } } }), { status: 200 })));
    await expect(fetchSignatureDocument("req-1")).resolves.toEqual(DOC);
  });

  test("throws NOT_FOUND on a 404 error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { json: { message: "Richiesta non trovata.", data: { code: "NOT_FOUND" } } } }), { status: 404 }))
    );
    await expect(fetchSignatureDocument("req-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("throws on a non-JSON response without crashing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 500 })));
    await expect(fetchSignatureDocument("req-1")).rejects.toBeInstanceOf(SignatureDocumentError);
  });
});
