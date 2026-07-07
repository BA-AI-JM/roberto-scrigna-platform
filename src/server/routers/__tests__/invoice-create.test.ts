/**
 * invoice.create — per-partner sequential numbering + retry-on-conflict (Tranche-2 #1).
 *
 * The number is computed read-then-increment (generateInvoiceNumber → RS-YYYY-NNNN,
 * scoped to partner_id). Under concurrent creates two invoices can compute the same
 * number → a PER-PARTNER unique violation (23505, idx_invoice_number_partner from
 * migration 016). create() must recompute + retry (bounded) rather than 500.
 *
 * Non-vacuous: the RETRY test proves a 23505 is recovered (result is the RECOMPUTED
 * number, insert ran twice) — mutation-probe by reverting to throw-on-23505 and it
 * fails. The exhausted-retries test proves the loop is bounded (exactly MAX attempts).
 */
import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

import { invoiceRouter } from "../invoice";

const CID = "22222222-2222-4222-8222-222222222222";
const YEAR = new Date().getFullYear();
const PFX = `RS-${YEAR}-`;
const LINE = [{ description: "Consulenza", quantity: 1, unitPriceCents: 10000 }];

/**
 * Fake Supabase for the create path. `failInserts` = how many leading inserts
 * return a 23505 (each also pushes its number into the table, simulating the
 * concurrent winner) before inserts start succeeding.
 */
function makeDb(opts: { existingNumbers?: string[]; failInserts?: number }) {
  const failInserts = opts.failInserts ?? 0;
  const invoices: Array<Record<string, unknown>> = (opts.existingNumbers ?? []).map((n, i) => ({
    id: `pre-${i}`,
    invoice_number: n,
    partner_id: "p1",
    deleted_at: null,
  }));
  let insertCalls = 0;

  const api = {
    _insertCalls: () => insertCalls,
    from(table: string) {
      const f: Record<string, unknown> = {};
      let orderCol: string | null = null;
      let orderAsc = true;
      let lim: number | null = null;
      let like: string | null = null;
      const base = () => {
        if (table === "client") return [{ id: CID, partner_id: "p1", deleted_at: null }];
        if (table === "invoice") return invoices;
        return [];
      };
      const rows = () => {
        let r = base().filter((row) => Object.entries(f).every(([k, v]) => row[k] === v));
        if (like) r = r.filter((row) => String(row.invoice_number ?? "").startsWith(like!));
        if (orderCol) {
          const c = orderCol;
          r = [...r].sort((a, b) => {
            const av = a[c] as string;
            const bv = b[c] as string;
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
        like: (_c: string, v: string) => ((like = v.replace("%", "")), b),
        order: (c: string, o?: { ascending?: boolean }) => ((orderCol = c), (orderAsc = o?.ascending ?? true), b),
        limit: (n: number) => ((lim = n), b),
        single: () =>
          Promise.resolve(
            rows()[0] ? { data: rows()[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } }
          ),
        then: (res: (v: unknown) => unknown) => res({ data: rows(), error: null }),
        insert: (payload: Record<string, unknown>) => {
          insertCalls++;
          if (insertCalls <= failInserts) {
            // Simulate the concurrent winner having taken this number.
            invoices.push({ ...payload, deleted_at: null });
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: { code: "23505", message: 'duplicate key value violates unique constraint "idx_invoice_number_partner"' },
                  }),
              }),
            };
          }
          const id = `inv-${insertCalls}`;
          invoices.push({ id, ...payload, deleted_at: null });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id, invoice_number: payload.invoice_number }, error: null }),
            }),
          };
        },
      };
      return b;
    },
  };
  return api;
}

const caller = (db: unknown, partnerId = "p1") =>
  invoiceRouter.createCaller({ userId: "u", partnerId, supabase: db } as never);

describe("invoice.create — per-partner numbering + retry", () => {
  test("first number when the partner has none → RS-YYYY-0001", async () => {
    const res = await caller(makeDb({})).create({ clientId: CID, lineItems: LINE, currency: "EUR" });
    expect(res.invoiceNumber).toBe(`${PFX}0001`);
  });

  test("sequential per-partner numbering (max + 1)", async () => {
    const res = await caller(makeDb({ existingNumbers: [`${PFX}0003`] })).create({
      clientId: CID,
      lineItems: LINE,
      currency: "EUR",
    });
    expect(res.invoiceNumber).toBe(`${PFX}0004`);
  });

  test("RETRY: a 23505 conflict on the number → recompute + succeed (no 500)", async () => {
    const db = makeDb({ failInserts: 1 }); // first insert conflicts; number 0001 gets taken
    const res = await caller(db).create({ clientId: CID, lineItems: LINE, currency: "EUR" });
    expect(res.invoiceNumber).toBe(`${PFX}0002`); // recomputed after seeing 0001 exists
    expect(db._insertCalls()).toBe(2); // one failed attempt + one success
  });

  test("exhausted retries (persistent conflict) → INTERNAL_SERVER_ERROR, bounded to MAX", async () => {
    const db = makeDb({ failInserts: 99 });
    await expect(
      caller(db).create({ clientId: CID, lineItems: LINE, currency: "EUR" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db._insertCalls()).toBe(5); // MAX_INVOICE_CREATE_ATTEMPTS
  });
});
