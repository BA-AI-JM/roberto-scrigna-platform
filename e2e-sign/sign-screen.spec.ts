import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Signing-screen behaviour E2E — UI behaviour with MOCKED data.
 *
 * The real <SignScreen> renders via the env-gated harness route; all tRPC HTTP
 * is intercepted (no DB / Supabase). This proves the screen's behaviour and
 * state routing. A true end-to-end pass against a real DB is gated on the
 * test-DB/staging setup (a v1.5 infra item) and is NOT claimed here.
 */

const REQ = "11111111-1111-1111-1111-111111111111";

type ProcResponse = { json?: unknown; errorCode?: string; httpStatus?: number; message?: string };

const DOC = {
  requestId: REQ,
  status: "pending",
  documentName: "Lettera d'incarico",
  versionNumber: 1,
  versionLabel: "v1",
  language: "it",
  contentHash: "abc123",
  bodyMd: "# Lettera d'incarico\n\nOggetto dell'incarico: consulenza nutrizionale.\n\nFirma del cliente: [PLACEHOLDER:firma].",
  practitionerName: "Roberto Scrigna",
  patientName: "Mario Rossi",
  missingTokens: [],
  pendingPlaceholders: ["[PLACEHOLDER:firma]"],
};

const REQ_META_PENDING = {
  id: REQ,
  document_version_id: "22222222-2222-2222-2222-222222222222",
  provider: "internal",
  status: "pending",
  accepted_at: null,
  acceptance_method: null,
  created_at: "2026-06-30T10:00:00Z",
};

const REQ_META_SIGNED = {
  ...REQ_META_PENDING,
  status: "signed",
  accepted_at: "2026-06-30T16:05:00Z",
  acceptance_method: "in_app_ses",
};

const ACCEPT_RESULT = {
  requestId: REQ,
  status: "signed",
  acceptedAt: "2026-06-30T16:05:00Z",
  acceptanceMethod: "in_app_ses",
};

// A tiny valid base64 PDF-ish payload for the download path.
const PDF_B64 = Buffer.from("%PDF-1.4\n% mock signed document\n").toString("base64");
const DOWNLOAD_RESULT = { pdfBase64: PDF_B64, mimeType: "application/pdf", filename: `lettera-firmata-${REQ}.pdf` };

/** Intercept ALL tRPC HTTP — both the batched typed client and the single raw adapter fetch. */
async function mockTrpc(page: Page, responses: Record<string, ProcResponse>) {
  await page.route("**/api/trpc/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const isBatch = url.searchParams.get("batch") === "1";
    const procPath = url.pathname.split("/api/trpc/")[1] ?? "";
    const procs = procPath.split(",").map((p) => decodeURIComponent(p));
    const entryFor = (proc: string) => {
      const r = responses[proc];
      if (!r) return { result: { data: { json: null } } };
      if (r.errorCode) {
        return { error: { json: { message: r.message ?? "error", code: -32004, data: { code: r.errorCode, httpStatus: r.httpStatus ?? 400 } } } };
      }
      return { result: { data: { json: r.json } } };
    };
    const body = isBatch ? procs.map(entryFor) : entryFor(procs[0]!);
    let status = 200;
    if (!isBatch) {
      const r = responses[procs[0]!];
      if (r?.errorCode) status = r.httpStatus ?? 404;
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

const open = (page: Page) => page.goto(`/portal/firma-e2e/${REQ}`);

test.describe("Patient SES signing screen", () => {
  test("(a) renders the letter body with the Accetto button DISABLED", async ({ page }) => {
    await mockTrpc(page, {
      "signature.getSignatureRequest": { json: REQ_META_PENDING },
      "signature.getSignatureDocument": { json: DOC },
    });
    await open(page);

    await expect(page.getByText("Oggetto dell'incarico")).toBeVisible();
    await expect(page.getByText("[PLACEHOLDER:firma]").first()).toBeVisible(); // gap shown, not hidden
    const accetto = page.getByRole("button", { name: "Accetto" });
    await expect(accetto).toBeVisible();
    await expect(accetto).toBeDisabled();
  });

  test("(b) ticking the acceptance checkbox enables Accetto", async ({ page }) => {
    await mockTrpc(page, {
      "signature.getSignatureRequest": { json: REQ_META_PENDING },
      "signature.getSignatureDocument": { json: DOC },
    });
    await open(page);

    const accetto = page.getByRole("button", { name: "Accetto" });
    await expect(accetto).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(accetto).toBeEnabled();
  });

  test("(c) accepting shows the signed confirmation", async ({ page }) => {
    await mockTrpc(page, {
      "signature.getSignatureRequest": { json: REQ_META_PENDING },
      "signature.getSignatureDocument": { json: DOC },
      "signature.acceptSignature": { json: ACCEPT_RESULT },
    });
    await open(page);

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Accetto" }).click();
    await expect(page.getByRole("heading", { name: "Documento firmato" })).toBeVisible();
  });

  test("(d) the signed confirmation offers the stamped-PDF download", async ({ page }) => {
    await mockTrpc(page, {
      "signature.getSignatureRequest": { json: REQ_META_PENDING },
      "signature.getSignatureDocument": { json: DOC },
      "signature.acceptSignature": { json: ACCEPT_RESULT },
      "signature.downloadSignedDocument": { json: DOWNLOAD_RESULT },
    });
    await open(page);

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Accetto" }).click();
    const dl = page.getByRole("button", { name: "Scarica documento firmato" });
    await expect(dl).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await dl.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("lettera-firmata");
  });

  test("(e) revisiting a SIGNED request shows confirmation, not the accept control", async ({ page }) => {
    await mockTrpc(page, {
      "signature.getSignatureRequest": { json: REQ_META_SIGNED },
      "signature.getSignatureDocument": { json: { ...DOC, status: "signed" } },
      "signature.downloadSignedDocument": { json: DOWNLOAD_RESULT },
    });
    await open(page);

    await expect(page.getByRole("heading", { name: "Documento firmato" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Scarica documento firmato" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Accetto" })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });

  test("(f) a not-this-patient / not-found request renders a friendly message", async ({ page }) => {
    await mockTrpc(page, {
      "signature.getSignatureRequest": { errorCode: "NOT_FOUND", httpStatus: 404, message: "Richiesta non trovata." },
      "signature.getSignatureDocument": { errorCode: "NOT_FOUND", httpStatus: 404, message: "Richiesta non trovata." },
    });
    await open(page);

    await expect(page.getByText("Documento non disponibile")).toBeVisible();
    await expect(page.getByText(/non trovata/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Accetto" })).toHaveCount(0);
  });
});
