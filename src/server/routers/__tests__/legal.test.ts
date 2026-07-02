/**
 * Legal router — engagement-letter generation + versioned templates (Req #29, Stage 1).
 *
 * Exercised through createCaller with a chainable fake Supabase (no DB, no
 * browser — generateEngagementLetterPdf is mocked, capturing the HTML). Asserts:
 *  - createVersion bumps version, SHA-256-hashes the body, archives the prior
 *    active version to 'replaced' (only a status flip — content never rewritten);
 *  - getActiveVersion returns the active template / null;
 *  - seedDefaultEngagementLetter is idempotent;
 *  - generateEngagementLetter fills the client + professional details, leaves the
 *    fields we don't hold (codice fiscale / residenza) as gaps, surfaces Roberto's
 *    pending [PLACEHOLDER]s, and returns a base64 PDF — cross-tenant client is
 *    rejected and a missing template fails with PRECONDITION_FAILED.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

const holder = vi.hoisted(() => ({
  inserted: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updates: [] as Array<{
    table: string;
    set: Record<string, unknown>;
    filters: Record<string, unknown>;
  }>,
  lastHtml: null as string | null,
}));

// Never launch Puppeteer in unit tests — capture the HTML, return a stub PDF.
vi.mock("../../legal-letter-pdf", () => ({
  generateEngagementLetterPdf: vi.fn(async (html: string) => {
    holder.lastHtml = html;
    return new Uint8Array([37, 80, 68, 70]); // "%PDF"
  }),
}));

import { legalRouter } from "../legal";
import { hashDocumentBody } from "../../legal-templates";
import { generateEngagementLetterPdf } from "../../legal-letter-pdf";

const VER1 = "11111111-1111-4111-8111-111111111111";
const CID = "22222222-2222-4222-8222-222222222222";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      let orderCol: string | null = null;
      let orderAsc = true;
      let lim: number | null = null;
      const filtered = () =>
        (tables[table] ?? []).filter((r) =>
          Object.entries(f).every(([k, v]) => r[k] === v)
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
        if (lim != null) r = r.slice(0, lim);
        return r;
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        is: (c: string, v: unknown) => ((f[c] = v), b),
        order: (c: string, o?: { ascending?: boolean }) => {
          orderCol = c;
          orderAsc = o?.ascending ?? true;
          return b;
        },
        limit: (n: number) => ((lim = n), b),
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
          const ret = { id: `${table}-new`, ...payload };
          return {
            select: () => ({ single: () => Promise.resolve({ data: ret, error: null }) }),
          };
        },
        update: (set: Record<string, unknown>) => {
          const uf: Record<string, unknown> = {};
          const u: Record<string, unknown> = {
            eq: (c: string, v: unknown) => ((uf[c] = v), u),
            is: (c: string, v: unknown) => ((uf[c] = v), u),
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

const partnerCaller = (db: unknown, partnerId = "p1") =>
  legalRouter.createCaller({ userId: "u", partnerId, supabase: db } as never);

beforeEach(() => {
  holder.inserted = [];
  holder.updates = [];
  holder.lastHtml = null;
});

// ── createVersion ──────────────────────────────────────────────────────────────
describe("legal.createVersion", () => {
  test("bumps version, hashes the body, archives the prior active version", async () => {
    const db = makeDb({
      legal_document: [{ id: "doc1", partner_id: "p1", doc_kind: "engagement_letter" }],
      legal_document_version: [
        { id: VER1, legal_document_id: "doc1", version_number: 1, status: "active" },
      ],
    });
    const res = await partnerCaller(db).createVersion({ bodyMd: "NUOVO TESTO" });

    expect(res.versionNumber).toBe(2);
    expect(res.contentHash).toBe(hashDocumentBody("NUOVO TESTO"));
    expect(res.status).toBe("active");

    const ins = holder.inserted.find((i) => i.table === "legal_document_version")!;
    expect(ins.payload.version_number).toBe(2);
    expect(ins.payload.content_hash).toBe(hashDocumentBody("NUOVO TESTO"));

    const arch = holder.updates.find((u) => u.table === "legal_document_version")!;
    expect(arch.set).toEqual({ status: "replaced" }); // only a status flip
    expect(arch.filters).toEqual({ legal_document_id: "doc1", status: "active" });
  });

  test("creates the document container on first publish (v1)", async () => {
    const db = makeDb({ legal_document: [], legal_document_version: [] });
    const res = await partnerCaller(db).createVersion({ bodyMd: "PRIMO" });
    expect(res.versionNumber).toBe(1);
    expect(holder.inserted.some((i) => i.table === "legal_document")).toBe(true);
  });
});

// ── getActiveVersion ────────────────────────────────────────────────────────────
describe("legal.getActiveVersion", () => {
  test("returns the active template version", async () => {
    const db = makeDb({
      legal_document: [
        { id: "doc1", name: "Lettera di Incarico", partner_id: "p1", doc_kind: "engagement_letter" },
      ],
      legal_document_version: [
        {
          id: VER1,
          legal_document_id: "doc1",
          status: "active",
          version_number: 1,
          version_label: "v1",
          language: "it",
          body_md: "# Lettera",
          content_hash: "H",
          published_at: "2026-06-30T00:00:00Z",
        },
      ],
    });
    const res = await partnerCaller(db).getActiveVersion();
    expect(res.version?.id).toBe(VER1);
    expect(res.version?.documentName).toBe("Lettera di Incarico");
    expect(res.version?.bodyMd).toBe("# Lettera");
  });

  test("returns null when no template published", async () => {
    const db = makeDb({ legal_document: [], legal_document_version: [] });
    const res = await partnerCaller(db).getActiveVersion();
    expect(res.version).toBeNull();
  });
});

// ── seedDefaultEngagementLetter ─────────────────────────────────────────────────
describe("legal.seedDefaultEngagementLetter", () => {
  test("publishes v1 when none exists", async () => {
    const db = makeDb({ legal_document: [], legal_document_version: [] });
    const res = await partnerCaller(db).seedDefaultEngagementLetter();
    expect(res.alreadySeeded).toBe(false);
    expect(res.versionNumber).toBe(1);
    expect(holder.inserted.some((i) => i.table === "legal_document_version")).toBe(true);
  });

  test("is idempotent when an active version exists", async () => {
    const db = makeDb({
      legal_document: [{ id: "doc1", partner_id: "p1", doc_kind: "engagement_letter" }],
      legal_document_version: [
        { id: VER1, legal_document_id: "doc1", version_number: 1, status: "active" },
      ],
    });
    const res = await partnerCaller(db).seedDefaultEngagementLetter();
    expect(res.alreadySeeded).toBe(true);
    expect(res.versionId).toBe(VER1);
    expect(holder.inserted.filter((i) => i.table === "legal_document_version")).toHaveLength(0);
  });
});

// ── generateEngagementLetter ────────────────────────────────────────────────────
function genTables(over?: { clientPartnerId?: string; withTemplate?: boolean }) {
  const withTemplate = over?.withTemplate ?? true;
  return {
    client: [
      {
        id: CID,
        full_name: "Mario Rossi",
        partner_id: over?.clientPartnerId ?? "p1",
        deleted_at: null,
      },
    ],
    partner: [{ id: "p1", full_name: "Roberto Scrigna" }],
    legal_document: withTemplate
      ? [{ id: "doc1", name: "Lettera di Incarico", partner_id: "p1", doc_kind: "engagement_letter" }]
      : [],
    legal_document_version: withTemplate
      ? [
          {
            id: VER1,
            legal_document_id: "doc1",
            status: "active",
            version_number: 1,
            version_label: "v1",
            language: "it",
            content_hash: "H",
            body_md:
              "# Incarico\n\n**{{professional_name}}** e **{{client_full_name}}**, C.F. {{client_codice_fiscale}}, residente in {{client_residence}}.\n\nLuogo e data: {{generated_date}}\n\nAlbo n. [PLACEHOLDER: numero iscrizione].",
          },
        ]
      : [],
  };
}

describe("legal.generateEngagementLetter", () => {
  test("fills client + professional, flags gaps, returns a base64 PDF", async () => {
    const db = makeDb(genTables());
    const res = await partnerCaller(db).generateEngagementLetter({ clientId: CID });

    expect(res.pdfBase64.length).toBeGreaterThan(0);
    expect(res.mimeType).toBe("application/pdf");
    expect(res.documentVersionId).toBe(VER1);
    expect(res.versionLabel).toBe("v1");
    // fields we hold are filled; fields we don't remain gaps
    expect(res.missingTokens).toContain("client_codice_fiscale");
    expect(res.missingTokens).toContain("client_residence");
    expect(res.missingTokens).not.toContain("client_full_name");
    // Roberto's pending placeholder surfaced
    expect(res.pendingPlaceholders).toContain("[PLACEHOLDER: numero iscrizione]");

    // the rendered HTML the PDF was built from has the merged values, not the tokens
    expect(holder.lastHtml).toContain("Mario Rossi");
    expect(holder.lastHtml).toContain("Roberto Scrigna");
    expect(holder.lastHtml).not.toContain("{{client_full_name}}");
  });

  test("rejects a client belonging to another professional (cross-tenant)", async () => {
    const db = makeDb(genTables({ clientPartnerId: "pOther" }));
    await expect(
      partnerCaller(db).generateEngagementLetter({ clientId: CID })
    ).rejects.toThrow();
  });

  test("fails with PRECONDITION when no active template is published", async () => {
    const db = makeDb(genTables({ withTemplate: false }));
    await expect(
      partnerCaller(db).generateEngagementLetter({ clientId: CID })
    ).rejects.toThrow();
  });

  test("PDF step failure → friendly INTERNAL_SERVER_ERROR, raw error not leaked (was the prod 500)", async () => {
    const db = makeDb(genTables()); // template IS active → passes the precondition
    (generateEngagementLetterPdf as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Protocol error: Chromium failed to launch on serverless")
    );
    await expect(
      partnerCaller(db).generateEngagementLetter({ clientId: CID })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      // friendly Italian message — the raw Chromium error is logged, not surfaced
      message: expect.stringContaining("PDF della lettera"),
    });
  });
});
