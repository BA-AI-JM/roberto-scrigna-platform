/**
 * Signature providers + factory (Req #29) — unit, no DB / no browser.
 */

import { describe, test, expect, vi, afterEach } from "vitest";
import {
  getSignatureProvider,
  activeSignatureProviderName,
} from "../factory";
import { InternalSignatureProvider } from "../internal-provider";
import { RemoteEsignProviderAdapter } from "../remote-provider";
import type { SignatureProviderDeps } from "../types";

/** Minimal fake supporting insert().select().single() and select().eq().single(). */
function fakeDeps(row?: Record<string, unknown>): SignatureProviderDeps & {
  inserted: Array<{ table: string; payload: Record<string, unknown> }>;
} {
  const inserted: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const db = {
    from() {
      return {
        insert(payload: Record<string, unknown>) {
          inserted.push({ table: "signature_request", payload });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "req-new", created_at: "2026-06-30T00:00:00Z", ...payload },
                  error: null,
                }),
            }),
          };
        },
        select() {
          return {
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: row ?? null,
                  error: row ? null : { message: "no rows" },
                }),
            }),
          };
        },
      };
    },
  };
  return {
    db: db as never,
    renderSignedLetterPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
    inserted,
  };
}

afterEach(() => {
  delete process.env.SIGNATURE_PROVIDER;
});

describe("getSignatureProvider factory", () => {
  test("returns the internal provider by default", () => {
    expect(activeSignatureProviderName()).toBe("internal");
    const p = getSignatureProvider(fakeDeps());
    expect(p).toBeInstanceOf(InternalSignatureProvider);
    expect(p.name).toBe("internal");
  });

  test("returns the placeholder remote provider when selected", () => {
    process.env.SIGNATURE_PROVIDER = "remote";
    const p = getSignatureProvider(fakeDeps());
    expect(p).toBeInstanceOf(RemoteEsignProviderAdapter);
    expect(p.name).toBe("remote");
  });
});

describe("RemoteEsignProviderAdapter (placeholder)", () => {
  test("every method throws a clear not-configured error", async () => {
    const p = new RemoteEsignProviderAdapter();
    await expect(p.createSignatureRequest({} as never)).rejects.toThrow(/not configured/i);
    await expect(p.getStatus("x")).rejects.toThrow(/not configured/i);
    await expect(p.downloadSignedDocument("x")).rejects.toThrow(/not configured/i);
    await expect(p.parseWebhookEvent(new Headers(), "{}")).rejects.toThrow(/not configured/i);
  });
});

describe("InternalSignatureProvider", () => {
  test("createSignatureRequest inserts a pending row and returns an in-app signing URL", async () => {
    const deps = fakeDeps();
    const p = new InternalSignatureProvider(deps);
    const res = await p.createSignatureRequest({
      clientId: "cA",
      partnerId: "p1",
      documentVersionId: "v1",
      title: "Lettera",
      language: "it",
      signer: { fullName: "Mario Rossi", email: "m@x.it" },
    });
    expect(res.status).toBe("pending");
    expect(res.signingUrl).toBe("/portal/firma/req-new"); // in-app, not external
    expect(deps.inserted[0]!.payload).toMatchObject({
      client_id: "cA",
      partner_id: "p1",
      document_version_id: "v1",
      provider: "internal",
      status: "pending",
    });
  });

  test("downloadSignedDocument regenerates on demand for a signed request", async () => {
    const deps = fakeDeps({ status: "signed" });
    const p = new InternalSignatureProvider(deps);
    const doc = await p.downloadSignedDocument("req-1");
    expect(doc.contentType).toBe("application/pdf");
    expect(doc.bytes.length).toBeGreaterThan(0);
    expect(deps.renderSignedLetterPdf).toHaveBeenCalledWith("req-1");
  });

  test("downloadSignedDocument refuses when not yet signed", async () => {
    const deps = fakeDeps({ status: "pending" });
    const p = new InternalSignatureProvider(deps);
    await expect(p.downloadSignedDocument("req-1")).rejects.toThrow(/not signed/i);
    expect(deps.renderSignedLetterPdf).not.toHaveBeenCalled();
  });

  test("parseWebhookEvent is inert (not applicable)", async () => {
    const p = new InternalSignatureProvider(fakeDeps());
    const ev = await p.parseWebhookEvent();
    expect((ev.raw as { applicable: boolean }).applicable).toBe(false);
  });
});
