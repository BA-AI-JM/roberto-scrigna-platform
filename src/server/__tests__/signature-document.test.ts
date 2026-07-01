/**
 * Signed-letter regeneration — VERSION INTEGRITY + stamp content (Req #29).
 *
 * Drives renderSignedEngagementLetterPdf with a fake DB; the fill + HTML renderer
 * are REAL (pure) so we assert the actual eIDAS attestation. Only the Puppeteer
 * step is stubbed — it captures the HTML the PDF would be built from.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cap = vi.hoisted(() => ({ htmls: [] as string[] }));
vi.mock("../legal-letter-pdf", () => ({
  generateEngagementLetterPdf: vi.fn(async (html: string) => {
    cap.htmls.push(html);
    return new Uint8Array([37, 80, 68, 70]);
  }),
}));

import { renderSignedEngagementLetterPdf } from "../signature-document";

const REQ = "33333333-3333-4333-8333-333333333333";
const CID = "22222222-2222-4222-8222-222222222222";
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

// A signed request pinned to VER1, while a NEWER VER2 is the active version.
function db() {
  return makeDb({
    signature_request: [
      {
        id: REQ,
        client_id: CID,
        partner_id: "p1",
        document_version_id: VER1, // ← frozen reference to the signed version
        status: "signed",
        // day > 12 (unambiguous it-IT vs en-US) at midday UTC (date stable across TZs)
        accepted_at: "2026-06-20T12:00:00Z",
        acceptance_method: "in_app_ses",
      },
    ],
    legal_document_version: [
      {
        id: VER1,
        legal_document_id: "doc1",
        version_number: 1,
        version_label: "v1",
        language: "it",
        body_md: "# Lettera di Incarico\n\nCliente: {{client_full_name}}.",
        content_hash: "HASHV1aaaaaaaaaa",
      },
      {
        id: VER2,
        legal_document_id: "doc1",
        version_number: 2,
        version_label: "v2",
        language: "it",
        status: "active",
        body_md: "# Lettera v2",
        content_hash: "HASHV2bbbbbbbbbb",
      },
    ],
    legal_document: [{ id: "doc1", name: "Lettera di Incarico" }],
    client: [{ id: CID, full_name: "Mario Rossi" }],
    partner: [{ id: "p1", full_name: "Roberto Scrigna" }],
  });
}

beforeEach(() => {
  cap.htmls = [];
});

describe("version integrity (frozen at the signed version)", () => {
  test("regenerated PDF embeds the SIGNED version's hash, not the newer active version's", async () => {
    await renderSignedEngagementLetterPdf(db() as never, REQ);
    const html = cap.htmls[0]!;
    expect(html).toContain("HASHV1aaaaaaaaaa"); // the pinned version's hash
    expect(html).not.toContain("HASHV2bbbbbbbbbb"); // the newer version must NOT leak in
    expect(html).toContain("versione 1");
    // Body-isolated fill assertion ("Cliente: Mario Rossi" appears ONLY in the body,
    // never in the stamp) — so a broken merge is caught independently of the stamp.
    expect(html).toContain("Cliente: Mario Rossi");
    expect(html).not.toContain("{{client_full_name}}");
    expect(html).not.toContain("{{"); // no unfilled token leaks into a SIGNED document
  });

  test("refuses to regenerate a request that is not signed", async () => {
    const notSigned = makeDb({
      signature_request: [
        { id: REQ, client_id: CID, partner_id: "p1", document_version_id: VER1, status: "pending", accepted_at: null },
      ],
    });
    await expect(renderSignedEngagementLetterPdf(notSigned as never, REQ)).rejects.toThrow(/not signed/i);
  });
});

describe("eIDAS SES attestation stamp", () => {
  test("stamps signer name, timestamp, version and hash with the eIDAS SES wording", async () => {
    await renderSignedEngagementLetterPdf(db() as never, REQ);
    const html = cap.htmls[0]!;
    // Stamp-isolated signer name (inside the attestation, not the body) so dropping
    // signature.signerName is NOT masked by the body's filled name.
    expect(html).toMatch(/accettato elettronicamente da <strong>Mario Rossi<\/strong>/);
    expect(html).toContain("Firma Elettronica Semplice");
    expect(html).toContain("eIDAS");
    expect(html).toContain("versione 1");
    expect(html).toContain("HASHV1aaaaaaaaaa");
    expect(html).toContain("20/06/2026"); // accepted_at formatted it-IT (DD/MM/YYYY)
    expect(html).toContain("C.F. n/d"); // codice fiscale fallback (not held)
    expect(html).toContain("Metodo: in_app_ses"); // acceptance method stamped
    expect(html).toContain("FIRMATO"); // signed banner, not the draft banner
    expect(html).not.toContain("BOZZA");
  });

  test("regeneration is stable: two calls produce identical output", async () => {
    await renderSignedEngagementLetterPdf(db() as never, REQ);
    await renderSignedEngagementLetterPdf(db() as never, REQ);
    expect(cap.htmls).toHaveLength(2);
    expect(cap.htmls[0]).toBe(cap.htmls[1]);
  });
});
