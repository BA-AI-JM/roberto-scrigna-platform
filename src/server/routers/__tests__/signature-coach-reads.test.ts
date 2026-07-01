/**
 * #29 coach reads — signature.getClientLetterStatus + downloadSignedForClient.
 *
 * Both are PARTNER-scoped: a coach may only read status / download for signature
 * requests belonging to THEIR OWN clients. The denial tests are non-vacuous — each
 * pairs a cross-partner DENIAL with a same-partner POSITIVE control on the SAME
 * seeded row, so a passing test proves the boundary is partner mismatch, not
 * missing data (and that the signed doc / status is never leaked cross-tenant).
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => holder.db,
}));
// Never launch Puppeteer — the on-demand signed-PDF renderer returns fixed bytes.
vi.mock("../../signature-document", () => ({
  renderSignedEngagementLetterPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])), // %PDF
}));

import { signatureRouter } from "../signature";

const P1 = "p1";
const POTHER = "pother";
const CID = "11111111-1111-4111-8111-111111111111"; // p1's client
const COTHER = "22222222-2222-4222-8222-222222222222"; // pother's client
const REQ = "33333333-3333-4333-8333-333333333333";
const VER = "44444444-4444-4444-8444-444444444444";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      let orderCol: string | null = null;
      let orderAsc = true;
      const rows = () => {
        let r = (tables[table] ?? []).filter((row) =>
          Object.entries(f).every(([k, v]) => row[k] === v)
        );
        if (orderCol) {
          const c = orderCol;
          r = [...r].sort((a, b) => {
            const av = a[c] as string, bv = b[c] as string;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }
        return r;
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        is: (c: string, v: unknown) => ((f[c] = v), b),
        order: (c: string, o?: { ascending?: boolean }) => {
          orderCol = c; orderAsc = o?.ascending ?? true; return b;
        },
        limit: () => b,
        single: () =>
          Promise.resolve(rows()[0] ? { data: rows()[0], error: null } : { data: null, error: { message: "no rows" } }),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      };
      return b;
    },
  };
}

const caller = (partnerId: string) =>
  signatureRouter.createCaller({ userId: "authU", partnerId } as never);

const CLIENTS = [
  { id: CID, partner_id: P1, deleted_at: null },
  { id: COTHER, partner_id: POTHER, deleted_at: null },
];
const VERSIONS = [{ id: VER, version_label: "v1" }];

beforeEach(() => { delete process.env.SIGNATURE_PROVIDER; });
afterEach(() => { delete process.env.SIGNATURE_PROVIDER; });

// ── getClientLetterStatus ────────────────────────────────────────────────────
describe("signature.getClientLetterStatus", () => {
  test("pending → { status:'pending', requestId, versionLabel }", async () => {
    holder.db = makeDb({
      client: CLIENTS, legal_document_version: VERSIONS,
      signature_request: [{ id: REQ, client_id: CID, partner_id: P1, status: "sent", document_version_id: VER, created_at: "2026-06-01" }],
    });
    const res = await caller(P1).getClientLetterStatus({ clientId: CID });
    expect(res).toMatchObject({ status: "pending", requestId: REQ, versionLabel: "v1" });
  });

  test("signed → { status:'signed', requestId, signedAt, versionLabel }", async () => {
    holder.db = makeDb({
      client: CLIENTS, legal_document_version: VERSIONS,
      signature_request: [{ id: REQ, client_id: CID, partner_id: P1, status: "signed", accepted_at: "2026-06-02T10:00:00Z", document_version_id: VER, created_at: "2026-06-01" }],
    });
    const res = await caller(P1).getClientLetterStatus({ clientId: CID });
    expect(res).toMatchObject({ status: "signed", requestId: REQ, signedAt: "2026-06-02T10:00:00Z", versionLabel: "v1" });
  });

  test("no request → { status:'none' }", async () => {
    holder.db = makeDb({ client: CLIENTS, legal_document_version: VERSIONS, signature_request: [] });
    const res = await caller(P1).getClientLetterStatus({ clientId: CID });
    expect(res).toEqual({ status: "none" });
  });

  test("PARTNER-SCOPE: p1 CANNOT read pother's client status (NOT_FOUND, no leak); pother CAN", async () => {
    // COTHER belongs to pother AND has a SIGNED request — so a leak would be observable.
    const db = () => makeDb({
      client: CLIENTS, legal_document_version: VERSIONS,
      signature_request: [{ id: REQ, client_id: COTHER, partner_id: POTHER, status: "signed", accepted_at: "2026-06-02T10:00:00Z", document_version_id: VER, created_at: "2026-06-01" }],
    });
    holder.db = db();
    await expect(caller(P1).getClientLetterStatus({ clientId: COTHER })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Positive control on the SAME row: the owning partner DOES see 'signed' →
    // the denial above is the partner boundary, not missing/absent data.
    holder.db = db();
    await expect(caller(POTHER).getClientLetterStatus({ clientId: COTHER })).resolves.toMatchObject({ status: "signed" });
  });
});

// ── downloadSignedForClient ──────────────────────────────────────────────────
describe("signature.downloadSignedForClient", () => {
  test("returns the base64 PDF for an own SIGNED request", async () => {
    holder.db = makeDb({
      client: CLIENTS,
      signature_request: [{ id: REQ, client_id: CID, partner_id: P1, status: "signed", document_version_id: VER, created_at: "2026-06-01" }],
    });
    const res = await caller(P1).downloadSignedForClient({ requestId: REQ });
    expect(res.mimeType).toBe("application/pdf");
    expect(res.filename).toContain(REQ);
    expect(Buffer.from(res.pdfBase64, "base64")).toEqual(Buffer.from([37, 80, 68, 70]));
  });

  test("not signed → PRECONDITION_FAILED (no document)", async () => {
    holder.db = makeDb({
      client: CLIENTS,
      signature_request: [{ id: REQ, client_id: CID, partner_id: P1, status: "sent", document_version_id: VER, created_at: "2026-06-01" }],
    });
    await expect(caller(P1).downloadSignedForClient({ requestId: REQ })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  test("PARTNER-SCOPE: p1 CANNOT download pother's signed request (NOT_FOUND, no PDF leak); pother CAN", async () => {
    const db = () => makeDb({
      client: CLIENTS,
      signature_request: [{ id: REQ, client_id: COTHER, partner_id: POTHER, status: "signed", document_version_id: VER, created_at: "2026-06-01" }],
    });
    holder.db = db();
    await expect(caller(P1).downloadSignedForClient({ requestId: REQ })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Positive control on the SAME signed request: the owning partner gets the PDF.
    holder.db = db();
    await expect(caller(POTHER).downloadSignedForClient({ requestId: REQ })).resolves.toMatchObject({ mimeType: "application/pdf" });
  });
});
