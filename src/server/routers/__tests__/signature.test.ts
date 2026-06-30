/**
 * Signature router — in-app SES behind the EsignProvider seam (Req #29).
 *
 * Through createCaller with a chainable fake Supabase (service-role mocked) and
 * the signed-PDF renderer mocked (no browser). Asserts:
 *  - createSignatureRequest → a pending row + an in-app signing URL;
 *  - acceptSignature flips the client's OWN pending request → signed and stamps
 *    accepted_at/accepted_by/acceptance_method='in_app_ses';
 *  - app-level immutability: a signed request cannot be re-accepted;
 *  - the accept is guarded to the 'internal' provider;
 *  - RLS scoping: a client only sees/accepts their own requests;
 *  - downloadSignedDocument returns a regenerated PDF for an own signed request.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

const holder = vi.hoisted(() => ({
  db: null as unknown,
  inserted: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updates: [] as Array<{
    table: string;
    set: Record<string, unknown>;
    filters: Record<string, unknown>;
  }>,
}));

vi.mock("../../../lib/supabase/service", () => ({
  createSupabaseServiceRole: () => holder.db,
}));

// Never launch Puppeteer — stub the on-demand signed-PDF renderer.
vi.mock("../../signature-document", () => ({
  renderSignedEngagementLetterPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

import { signatureRouter } from "../signature";

const VER1 = "11111111-1111-4111-8111-111111111111";
const CID = "22222222-2222-4222-8222-222222222222";
const REQ = "33333333-3333-4333-8333-333333333333";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      const ins: Array<[string, unknown[]]> = [];
      let orderCol: string | null = null;
      let orderAsc = true;
      const filtered = () =>
        (tables[table] ?? []).filter(
          (r) =>
            Object.entries(f).every(([k, v]) => r[k] === v) &&
            ins.every(([k, arr]) => arr.includes(r[k]))
        );
      const rows = () => {
        let r = filtered();
        if (orderCol) {
          const c = orderCol;
          r = [...r].sort((a, b) => {
            const av = a[c] as number | string;
            const bv = b[c] as number | string;
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
        in: (c: string, arr: unknown[]) => (ins.push([c, arr]), b),
        order: (c: string, o?: { ascending?: boolean }) => {
          orderCol = c;
          orderAsc = o?.ascending ?? true;
          return b;
        },
        single: () =>
          Promise.resolve(
            rows()[0]
              ? { data: rows()[0], error: null }
              : { data: null, error: { message: "no rows" } }
          ),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res({ data: rows(), error: null }),
        insert: (payload: Record<string, unknown>) => {
          holder.inserted.push({ table, payload });
          const ret = { id: `${table}-new`, created_at: "2026-06-30T00:00:00Z", ...payload };
          return {
            select: () => ({ single: () => Promise.resolve({ data: ret, error: null }) }),
          };
        },
        update: (set: Record<string, unknown>) => {
          const uf: Record<string, unknown> = {};
          const u: Record<string, unknown> = {
            eq: (c: string, v: unknown) => ((uf[c] = v), u),
            is: (c: string, v: unknown) => ((uf[c] = v), u),
            select: () => ({
              single: () => {
                holder.updates.push({ table, set, filters: { ...uf } });
                return Promise.resolve({
                  data: { id: (uf.id as string) ?? `${table}-upd`, ...set },
                  error: null,
                });
              },
            }),
            then: (res: (v: unknown) => unknown) => {
              holder.updates.push({ table, set, filters: { ...uf } });
              return res({ data: null, error: null });
            },
          };
          return u;
        },
      };
      return b;
    },
  };
}

const partnerCaller = (partnerId = "p1") =>
  signatureRouter.createCaller({ userId: "authU", partnerId } as never);
const clientCaller = (clientId = CID) =>
  signatureRouter.createCaller({ userId: "authU", clientId } as never);

beforeEach(() => {
  holder.inserted = [];
  holder.updates = [];
  delete process.env.SIGNATURE_PROVIDER;
});
afterEach(() => {
  delete process.env.SIGNATURE_PROVIDER;
});

// ── createSignatureRequest (partner) ────────────────────────────────────────────
describe("signature.createSignatureRequest", () => {
  test("creates a pending request with an in-app signing URL", async () => {
    holder.db = makeDb({
      client: [{ id: CID, full_name: "Mario Rossi", email: "m@x.it", partner_id: "p1", deleted_at: null }],
      legal_document: [{ id: "doc1", name: "Lettera di Incarico", partner_id: "p1", doc_kind: "engagement_letter" }],
      legal_document_version: [
        { id: VER1, legal_document_id: "doc1", status: "active", version_label: "v1", language: "it" },
      ],
      signature_request: [],
    });
    const res = await partnerCaller().createSignatureRequest({ clientId: CID });

    expect(res.status).toBe("pending");
    expect(res.provider).toBe("internal");
    expect(res.signingUrl).toBe("/portal/firma/signature_request-new");

    const row = holder.inserted.find((i) => i.table === "signature_request")!.payload;
    expect(row).toMatchObject({
      client_id: CID,
      partner_id: "p1",
      document_version_id: VER1,
      provider: "internal",
      status: "pending",
    });
  });

  test("fails with PRECONDITION when no active template is published", async () => {
    holder.db = makeDb({
      client: [{ id: CID, full_name: "X", partner_id: "p1", deleted_at: null }],
      legal_document: [],
      legal_document_version: [],
      signature_request: [],
    });
    await expect(partnerCaller().createSignatureRequest({ clientId: CID })).rejects.toThrow();
  });
});

// ── acceptSignature (client, internal SES) ──────────────────────────────────────
describe("signature.acceptSignature", () => {
  test("flips the client's own pending request to signed and stamps it", async () => {
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: CID, status: "pending" }],
    });
    const res = await clientCaller().acceptSignature({ requestId: REQ });

    expect(res.status).toBe("signed");
    expect(res.acceptanceMethod).toBe("in_app_ses");
    expect(res.acceptedAt).toBeDefined();

    const upd = holder.updates.find((u) => u.table === "signature_request")!;
    expect(upd.set).toMatchObject({
      status: "signed",
      accepted_by: "authU",
      acceptance_method: "in_app_ses",
    });
    expect(upd.set.accepted_at).toBeDefined();
    expect(upd.filters).toEqual({ id: REQ, client_id: CID });
  });

  test("app-level immutability: an already-signed request cannot be re-accepted", async () => {
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: CID, status: "signed" }],
    });
    await expect(clientCaller().acceptSignature({ requestId: REQ })).rejects.toThrow();
    expect(holder.updates).toHaveLength(0);
  });

  test("is rejected when the active provider is not internal", async () => {
    process.env.SIGNATURE_PROVIDER = "remote";
    holder.db = makeDb({ signature_request: [{ id: REQ, client_id: CID, status: "pending" }] });
    await expect(clientCaller().acceptSignature({ requestId: REQ })).rejects.toThrow();
    expect(holder.updates).toHaveLength(0);
  });

  test("RLS scoping: a client cannot accept another client's request", async () => {
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: "other-client", status: "pending" }],
    });
    await expect(clientCaller().acceptSignature({ requestId: REQ })).rejects.toThrow();
    expect(holder.updates).toHaveLength(0);
  });
});

// ── getMyPendingSignatures (client) ─────────────────────────────────────────────
describe("signature.getMyPendingSignatures", () => {
  test("returns only the client's own open requests", async () => {
    holder.db = makeDb({
      signature_request: [
        { id: "r1", client_id: CID, status: "pending", provider: "internal", document_version_id: VER1, created_at: "2026-06-30T02:00:00Z" },
        { id: "r2", client_id: CID, status: "signed", provider: "internal", document_version_id: VER1, created_at: "2026-06-30T01:00:00Z" },
        { id: "r3", client_id: "other", status: "pending", provider: "internal", document_version_id: VER1, created_at: "2026-06-30T03:00:00Z" },
      ],
    });
    const list = await clientCaller().getMyPendingSignatures();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("r1");
  });
});

// ── downloadSignedDocument (client) ─────────────────────────────────────────────
describe("signature.downloadSignedDocument", () => {
  test("returns a regenerated PDF for an own signed request", async () => {
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: CID, status: "signed" }],
    });
    const res = await clientCaller().downloadSignedDocument({ requestId: REQ });
    expect(res.pdfBase64.length).toBeGreaterThan(0);
    expect(res.mimeType).toBe("application/pdf");
  });

  test("refuses to download an unsigned request", async () => {
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: CID, status: "pending" }],
    });
    await expect(clientCaller().downloadSignedDocument({ requestId: REQ })).rejects.toThrow();
  });
});
