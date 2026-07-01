/**
 * Signature router — ADVERSARIAL hardening (Req #29). The cases unit tests miss:
 * app-level immutability of a signed request, RLS/tenant scoping, the provider
 * guard, and the accept state machine. Pure (service-role Supabase mocked;
 * signed-PDF renderer stubbed — no browser).
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
vi.mock("../../signature-document", () => ({
  renderSignedEngagementLetterPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

import { signatureRouter } from "../signature";

const VER1 = "11111111-1111-4111-8111-111111111111";
const CID = "22222222-2222-4222-8222-222222222222";
const OTHER_CID = "44444444-4444-4444-8444-444444444444";
const REQ = "33333333-3333-4333-8333-333333333333";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      const ins: Array<[string, unknown[]]> = [];
      const filtered = () =>
        (tables[table] ?? []).filter(
          (r) =>
            Object.entries(f).every(([k, v]) => r[k] === v) &&
            ins.every(([k, arr]) => arr.includes(r[k]))
        );
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        is: (c: string, v: unknown) => ((f[c] = v), b),
        in: (c: string, arr: unknown[]) => (ins.push([c, arr]), b),
        order: () => b,
        single: () =>
          Promise.resolve(
            filtered()[0]
              ? { data: filtered()[0], error: null }
              : { data: null, error: { message: "no rows" } }
          ),
        maybeSingle: () => Promise.resolve({ data: filtered()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res({ data: filtered(), error: null }),
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
            select: () => ({
              single: () => {
                holder.updates.push({ table, set, filters: { ...uf } });
                return Promise.resolve({ data: { id: uf.id ?? "upd", ...set }, error: null });
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

// ── 1. Immutability (app level) ─────────────────────────────────────────────────
describe("immutability of a signed request", () => {
  test("re-accepting a signed request is rejected by the dedicated already-signed guard and writes NOTHING", async () => {
    holder.db = makeDb({
      signature_request: [
        {
          id: REQ,
          client_id: CID,
          status: "signed",
          accepted_by: "first-signer",
          accepted_at: "2026-06-30T09:00:00Z",
          acceptance_method: "in_app_ses",
        },
      ],
    });
    // Match the SPECIFIC already-signed message ("...già firmato") so deleting the
    // dedicated guard (and falling through to the open-status guard, whose message
    // is "...non è firmabile") is NOT an equivalent mutant.
    await expect(clientCaller().acceptSignature({ requestId: REQ })).rejects.toThrow(/firmato/i);
    // No update issued → the original accepted_by / accepted_at cannot be overwritten.
    expect(holder.updates).toHaveLength(0);
  });

  test("the ONLY mutation entry point is acceptSignature (reads never write)", async () => {
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: CID, status: "signed", accepted_at: "2026-06-30T09:00:00Z" }],
    });
    await clientCaller().getSignatureRequest({ requestId: REQ });
    await clientCaller().getSignatureStatus({ requestId: REQ });
    await clientCaller().downloadSignedDocument({ requestId: REQ });
    expect(holder.updates).toHaveLength(0);
    expect(holder.inserted).toHaveLength(0);
  });
});

// ── 2. RLS / tenant scoping ─────────────────────────────────────────────────────
describe("tenant scoping", () => {
  test("a client cannot READ another client's request (every read scoped to ctx.clientId)", async () => {
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: OTHER_CID, status: "pending", accepted_at: null }],
    });
    await expect(clientCaller(CID).getSignatureRequest({ requestId: REQ })).rejects.toThrow();
    await expect(clientCaller(CID).getSignatureStatus({ requestId: REQ })).rejects.toThrow();
    await expect(clientCaller(CID).downloadSignedDocument({ requestId: REQ })).rejects.toThrow();
  });

  test("a client cannot DOWNLOAD another client's SIGNED letter (scope not masked by the status guard)", async () => {
    // Foreign row is SIGNED: if the client_id scope were dropped, the status
    // precondition would pass and the mocked renderer would return a PDF. So this
    // case isolates the tenant scope on downloadSignedDocument specifically.
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: OTHER_CID, status: "signed" }],
    });
    await expect(clientCaller(CID).downloadSignedDocument({ requestId: REQ })).rejects.toThrow();
  });

  test("a client cannot ACCEPT another client's request", async () => {
    holder.db = makeDb({
      signature_request: [{ id: REQ, client_id: OTHER_CID, status: "pending" }],
    });
    await expect(clientCaller(CID).acceptSignature({ requestId: REQ })).rejects.toThrow();
    expect(holder.updates).toHaveLength(0);
  });

  test("a partner cannot create a request for another partner's client (cross-tenant)", async () => {
    holder.db = makeDb({
      client: [{ id: CID, full_name: "Mario", partner_id: "p2", deleted_at: null }],
      legal_document: [{ id: "doc1", name: "L", partner_id: "p1", doc_kind: "engagement_letter" }],
      legal_document_version: [{ id: VER1, legal_document_id: "doc1", status: "active", version_label: "v1", language: "it" }],
      signature_request: [],
    });
    await expect(partnerCaller("p1").createSignatureRequest({ clientId: CID })).rejects.toThrow();
    expect(holder.inserted).toHaveLength(0);
  });
});

// ── 3. Provider guard ───────────────────────────────────────────────────────────
describe("provider guard", () => {
  test("internal: acceptSignature works (sanity for the guard)", async () => {
    holder.db = makeDb({ signature_request: [{ id: REQ, client_id: CID, status: "pending" }] });
    const res = await clientCaller().acceptSignature({ requestId: REQ });
    expect(res.status).toBe("signed");
  });

  test("remote: createSignatureRequest routes to the placeholder, which throws 'not configured' (no row written)", async () => {
    process.env.SIGNATURE_PROVIDER = "remote";
    holder.db = makeDb({
      client: [{ id: CID, full_name: "Mario", partner_id: "p1", deleted_at: null }],
      legal_document: [{ id: "doc1", name: "L", partner_id: "p1", doc_kind: "engagement_letter" }],
      legal_document_version: [{ id: VER1, legal_document_id: "doc1", status: "active", version_label: "v1", language: "it" }],
      signature_request: [],
    });
    await expect(partnerCaller("p1").createSignatureRequest({ clientId: CID })).rejects.toThrow(
      /not configured/i
    );
    expect(holder.inserted).toHaveLength(0);
  });

  test("remote: acceptSignature is guarded BEFORE any DB access (not a crash)", async () => {
    process.env.SIGNATURE_PROVIDER = "remote";
    holder.db = makeDb({ signature_request: [{ id: REQ, client_id: CID, status: "pending" }] });
    await expect(clientCaller().acceptSignature({ requestId: REQ })).rejects.toThrow(
      /provider di firma interno/i
    );
    expect(holder.updates).toHaveLength(0);
  });
});

// ── 6. Accept state machine ─────────────────────────────────────────────────────
describe("accept state machine", () => {
  for (const status of ["expired", "cancelled", "declined", "signed"] as const) {
    test(`acceptSignature is rejected for status='${status}' with no write`, async () => {
      holder.db = makeDb({ signature_request: [{ id: REQ, client_id: CID, status }] });
      await expect(clientCaller().acceptSignature({ requestId: REQ })).rejects.toThrow();
      expect(holder.updates).toHaveLength(0);
    });
  }

  for (const status of ["pending", "sent", "viewed"] as const) {
    test(`acceptSignature SUCCEEDS for open status='${status}'`, async () => {
      holder.db = makeDb({ signature_request: [{ id: REQ, client_id: CID, status }] });
      const res = await clientCaller().acceptSignature({ requestId: REQ });
      expect(res.status).toBe("signed");
      expect(holder.updates).toHaveLength(1);
    });
  }

  test("the persisted accept WRITE sets status='signed' + stamps, scoped to the caller", async () => {
    holder.db = makeDb({ signature_request: [{ id: REQ, client_id: CID, status: "pending" }] });
    await clientCaller(CID).acceptSignature({ requestId: REQ });
    const w = holder.updates[0]!;
    // Inspect the actual written payload (not just that an update happened): a no-op
    // write (status=req.status) or a dropped stamp would otherwise pass.
    expect(w.set).toMatchObject({
      status: "signed",
      accepted_by: "authU",
      acceptance_method: "in_app_ses",
    });
    expect(w.set.accepted_at).toBeDefined();
    // The UPDATE itself is tenant-scoped (defence-in-depth alongside the load select).
    expect(w.filters).toMatchObject({ id: REQ, client_id: CID });
  });
});
