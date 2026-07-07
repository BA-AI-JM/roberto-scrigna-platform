/**
 * signature.getSignatureDocument — client-readable engagement letter (Req #29).
 *
 * The in-app SES screen must show the letter BEFORE signing. Pure (service-role
 * Supabase mocked). Asserts: own request readable pre-sign with the filled body;
 * a foreign request is denied (scope NOT masked by any status precondition — the
 * #44 mutation-audit lesson, since this procedure has no status guard); the
 * gaps reflect actual unfilled fields; contentHash is the frozen pinned version.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => holder.db,
}));
// getSignatureDocument never renders a PDF; stub the puppeteer seam so importing
// the router does not pull Chromium in.
vi.mock("../../signature-document", () => ({
  renderSignedEngagementLetterPdf: vi.fn(),
}));

import { signatureRouter } from "../signature";

const REQ = "33333333-3333-4333-8333-333333333333";
const CID = "22222222-2222-4222-8222-222222222222";
const OTHER_CID = "44444444-4444-4444-8444-444444444444";
const VER1 = "11111111-1111-4111-8111-111111111111";
const VER2 = "55555555-5555-4555-8555-555555555555";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      const filtered = () =>
        (tables[table] ?? []).filter((r) => Object.entries(f).every(([k, v]) => r[k] === v));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        single: () =>
          Promise.resolve(
            filtered()[0]
              ? { data: filtered()[0], error: null }
              : { data: null, error: { message: "no rows" } }
          ),
      };
      return b;
    },
  };
}

const clientCaller = (clientId = CID) =>
  signatureRouter.createCaller({ userId: "authU", clientId } as never);

// A pending request pinned to VER1, with a NEWER active VER2 present.
function tables(over?: { reqClientId?: string }) {
  return {
    signature_request: [
      {
        id: REQ,
        status: "pending",
        document_version_id: VER1,
        partner_id: "p1",
        client_id: over?.reqClientId ?? CID,
      },
    ],
    legal_document_version: [
      {
        id: VER1,
        legal_document_id: "doc1",
        version_number: 1,
        version_label: "v1",
        language: "it",
        body_md:
          "# Lettera di Incarico\n\n**{{professional_name}}** e **{{client_full_name}}**, " +
          "C.F. {{client_codice_fiscale}}. Albo n. [PLACEHOLDER: numero iscrizione].",
        content_hash: "HASHV1aaaaaaaaaa",
      },
      {
        id: VER2,
        legal_document_id: "doc1",
        version_number: 2,
        version_label: "v2",
        language: "it",
        status: "active",
        body_md: "# v2",
        content_hash: "HASHV2bbbbbbbbbb",
      },
    ],
    legal_document: [{ id: "doc1", name: "Lettera di Incarico" }],
    client: [{ id: CID, full_name: "Mario Rossi" }],
    partner: [{ id: "p1", full_name: "Roberto Scrigna" }],
  };
}

beforeEach(() => {
  holder.db = makeDb(tables());
});

describe("signature.getSignatureDocument", () => {
  test("returns the filled letter body for the client's OWN request, pre-sign", async () => {
    const res = await clientCaller(CID).getSignatureDocument({ requestId: REQ });

    expect(res.requestId).toBe(REQ);
    expect(res.status).toBe("pending"); // readable BEFORE signing
    expect(res.documentName).toBe("Lettera di Incarico");
    expect(res.versionNumber).toBe(1);
    expect(res.versionLabel).toBe("v1");
    expect(res.language).toBe("it");
    expect(res.practitionerName).toBe("Roberto Scrigna");
    expect(res.patientName).toBe("Mario Rossi");
    // the BODY (markdown) is returned, filled, not a PDF
    expect(res.bodyMd).toContain("Roberto Scrigna");
    expect(res.bodyMd).toContain("Mario Rossi");
    expect(res.bodyMd).not.toContain("{{professional_name}}");
    expect(res.bodyMd).not.toContain("{{client_full_name}}");
  });

  test("DENIES another client's request (scope, not masked by any status guard)", async () => {
    // Foreign request is 'pending' (a status this procedure WOULD otherwise return);
    // the only thing blocking it is the client_id scope, so the denial is meaningful.
    holder.db = makeDb(tables({ reqClientId: OTHER_CID }));
    await expect(clientCaller(CID).getSignatureDocument({ requestId: REQ })).rejects.toThrow();
  });

  test("missingTokens / pendingPlaceholders reflect the actual unfilled fields", async () => {
    const res = await clientCaller(CID).getSignatureDocument({ requestId: REQ });
    // filled (we hold these) → not missing
    expect(res.missingTokens).not.toContain("client_full_name");
    // not held → rendered as a clear "[DA COMPLETARE: …]" gap (not a raw token)
    expect(res.missingTokens).toContain("client_codice_fiscale");
    expect(res.bodyMd).not.toContain("{{client_codice_fiscale}}");
    expect(res.bodyMd).toContain("[DA COMPLETARE: Codice Fiscale cliente]");
    // Roberto's pending field surfaced
    expect(res.pendingPlaceholders).toEqual(["[PLACEHOLDER: numero iscrizione]"]);
  });

  test("contentHash is the FROZEN pinned version, not the newer active one", async () => {
    const res = await clientCaller(CID).getSignatureDocument({ requestId: REQ });
    expect(res.contentHash).toBe("HASHV1aaaaaaaaaa"); // VER1, the request's version
    expect(res.contentHash).not.toBe("HASHV2bbbbbbbbbb"); // newer active version ignored
    expect(res.versionNumber).toBe(1);
  });
});
