/**
 * C5 — invoice payment methods + markPaid (payment_method migration 024).
 *
 * Covers: the shared payment-method zod enum bounds (create + markPaid reject an
 * out-of-enum value; all three legal values are accepted and persisted); markPaid
 * partner-scope denial (a foreign invoice throws and writes nothing); and that
 * markPaid keeps the existing status machine intact (only sent/overdue → paid).
 *
 * Mock-db mirrors src/server/routers/__tests__/session-kcal-override.test.ts:
 * a chainable fake Supabase that records writes so we can assert set + filters.
 */
import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

import { invoiceRouter } from "../invoice";

const IID = "33333333-3333-4333-8333-333333333333";
const CID = "22222222-2222-4222-8222-222222222222";
const YEAR = new Date().getFullYear();
const PFX = `RS-${YEAR}-`;
const TODAY = new Date().toISOString().split("T")[0];
const LINE = [{ description: "Consulenza", quantity: 1, unitPriceCents: 10000 }];

/**
 * Chainable fake Supabase covering the markPaid path (fetch → update) and the
 * create path (client verify → number query → insert). Records every update
 * (`_updated`) and insert payload (`_inserted`) for assertions.
 */
function makeDb(seed: {
  invoices?: Array<Record<string, unknown>>;
  clients?: Array<Record<string, unknown>>;
}) {
  const invoices = seed.invoices ?? [];
  const clients = seed.clients ?? [];
  const updated: Array<{ set: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  const inserted: Array<Record<string, unknown>> = [];
  let insertSeq = 0;

  return {
    _updated: () => updated,
    _inserted: () => inserted,
    from(table: string) {
      const rowsFor = () => (table === "client" ? clients : table === "invoice" ? invoices : []);
      const f: Record<string, unknown> = {};
      let orderCol: string | null = null;
      let orderAsc = true;
      let lim: number | null = null;
      let likePfx: string | null = null;

      const applied = () => {
        let r = rowsFor().filter((row) => Object.entries(f).every(([k, v]) => row[k] === v));
        if (likePfx) r = r.filter((row) => String(row.invoice_number ?? "").startsWith(likePfx!));
        if (orderCol) {
          const c = orderCol;
          r = [...r].sort((a, b) => {
            const av = String(a[c] ?? "");
            const bv = String(b[c] ?? "");
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }
        if (lim != null) r = r.slice(0, lim);
        return r;
      };

      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        is: (c: string, v: unknown) => ((f[c] = v), b),
        like: (_c: string, v: string) => ((likePfx = v.replace("%", "")), b),
        order: (c: string, o?: { ascending?: boolean }) => ((orderCol = c), (orderAsc = o?.ascending ?? true), b),
        limit: (n: number) => ((lim = n), b),
        single: () =>
          Promise.resolve(
            applied()[0]
              ? { data: applied()[0], error: null }
              : { data: null, error: { code: "PGRST116", message: "no rows" } }
          ),
        // Awaited chains without .single() (e.g. the number query) resolve here.
        then: (resolve: (v: unknown) => unknown) => resolve({ data: applied(), error: null }),
        insert: (payload: Record<string, unknown>) => {
          insertSeq++;
          const id = `inv-${insertSeq}`;
          invoices.push({ id, ...payload, deleted_at: null });
          inserted.push(payload);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id, invoice_number: payload.invoice_number }, error: null }),
            }),
          };
        },
        update: (set: Record<string, unknown>) => {
          const uf: Record<string, unknown> = {};
          const ub: Record<string, unknown> = {
            eq: (c: string, v: unknown) => ((uf[c] = v), ub),
            is: (c: string, v: unknown) => ((uf[c] = v), ub),
            then: (resolve: (v: unknown) => unknown) => {
              const match = rowsFor().find((row) => Object.entries(uf).every(([k, v]) => row[k] === v));
              if (!match) return resolve({ error: { code: "PGRST116", message: "no rows" } });
              updated.push({ set, filters: { ...uf } });
              Object.assign(match, set);
              return resolve({ error: null });
            },
          };
          return ub;
        },
      };
      return b;
    },
  };
}

const caller = (db: unknown, partnerId = "p1") =>
  invoiceRouter.createCaller({ userId: "u", partnerId, supabase: db } as never);

const sentInvoice = () => ({ id: IID, status: "sent", partner_id: "p1", deleted_at: null });

// ── zod enum bounds (shared paymentMethodSchema) ─────────────────────────────
describe("payment-method enum bounds", () => {
  test.each(["contanti", "bonifico", "sumup"] as const)(
    "markPaid accepts %s and persists it",
    async (method) => {
      const db = makeDb({ invoices: [sentInvoice()] });
      const res = await caller(db).markPaid({ id: IID, paymentMethod: method });
      expect(res).toEqual({ success: true });
      expect(db._updated()[0]!.set).toMatchObject({ status: "paid", payment_method: method });
    }
  );

  test("markPaid REJECTS an out-of-enum method (no write)", async () => {
    const db = makeDb({ invoices: [sentInvoice()] });
    await expect(
      // @ts-expect-error — deliberately invalid enum value
      caller(db).markPaid({ id: IID, paymentMethod: "paypal" })
    ).rejects.toThrow();
    expect(db._updated()).toHaveLength(0);
  });

  test("create REJECTS an out-of-enum method (no insert)", async () => {
    const db = makeDb({ clients: [{ id: CID, partner_id: "p1", deleted_at: null }] });
    await expect(
      // @ts-expect-error — deliberately invalid enum value
      caller(db).create({ clientId: CID, lineItems: LINE, currency: "EUR", paymentMethod: "paypal" })
    ).rejects.toThrow();
    expect(db._inserted()).toHaveLength(0);
  });

  test("create persists a valid method into the insert payload", async () => {
    const db = makeDb({ clients: [{ id: CID, partner_id: "p1", deleted_at: null }] });
    const res = await caller(db).create({
      clientId: CID,
      lineItems: LINE,
      currency: "EUR",
      paymentMethod: "bonifico",
    });
    expect(res.invoiceNumber).toBe(`${PFX}0001`);
    expect(db._inserted()[0]!.payment_method).toBe("bonifico");
  });

  test("create without a method persists payment_method: null", async () => {
    const db = makeDb({ clients: [{ id: CID, partner_id: "p1", deleted_at: null }] });
    await caller(db).create({ clientId: CID, lineItems: LINE, currency: "EUR" });
    expect(db._inserted()[0]!.payment_method).toBeNull();
  });
});

// ── markPaid behaviour ───────────────────────────────────────────────────────
describe("invoice.markPaid", () => {
  test("sets status=paid + today's paid_date, scoped to id + partner", async () => {
    const db = makeDb({ invoices: [sentInvoice()] });
    await caller(db).markPaid({ id: IID, paymentMethod: "contanti" });

    const w = db._updated()[0]!;
    expect(w.set).toMatchObject({ status: "paid", paid_date: TODAY, payment_method: "contanti" });
    expect(w.filters).toMatchObject({ id: IID, partner_id: "p1" });
  });

  test("without a method → paid + date, but no payment_method column written", async () => {
    const db = makeDb({ invoices: [sentInvoice()] });
    await caller(db).markPaid({ id: IID });

    const set = db._updated()[0]!.set;
    expect(set).toMatchObject({ status: "paid", paid_date: TODAY });
    expect("payment_method" in set).toBe(false);
  });

  test("honours an explicit paidDate", async () => {
    const db = makeDb({ invoices: [sentInvoice()] });
    await caller(db).markPaid({ id: IID, paidDate: "2026-01-15" });
    expect(db._updated()[0]!.set).toMatchObject({ paid_date: "2026-01-15" });
  });

  test("DENIES an invoice belonging to another partner (no write)", async () => {
    const db = makeDb({
      invoices: [{ id: IID, status: "sent", partner_id: "pOther", deleted_at: null }],
    });
    await expect(caller(db, "p1").markPaid({ id: IID, paymentMethod: "contanti" })).rejects.toThrow();
    expect(db._updated()).toHaveLength(0);
  });

  test.each(["draft", "paid", "cancelled"] as const)(
    "keeps the status machine intact: %s → paid is rejected (no write)",
    async (status) => {
      const db = makeDb({ invoices: [{ id: IID, status, partner_id: "p1", deleted_at: null }] });
      await expect(caller(db).markPaid({ id: IID })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db._updated()).toHaveLength(0);
    }
  );

  test("overdue → paid is allowed", async () => {
    const db = makeDb({ invoices: [{ id: IID, status: "overdue", partner_id: "p1", deleted_at: null }] });
    const res = await caller(db).markPaid({ id: IID, paymentMethod: "sumup" });
    expect(res).toEqual({ success: true });
    expect(db._updated()[0]!.set).toMatchObject({ status: "paid", payment_method: "sumup" });
  });
});
