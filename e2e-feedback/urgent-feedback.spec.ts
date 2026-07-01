import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Urgent-feedback screen behaviour E2E — UI behaviour with MOCKED data.
 *
 * Drives the REAL <UrgentFeedbackScreen> via the env-gated harness route; the
 * feedback tRPC calls are intercepted (no DB / Supabase). A true end-to-end pass
 * against a real DB is gated on the test-DB/staging setup (a v1.5 infra item)
 * and is NOT claimed here.
 */
type Resp = { json?: unknown; errorCode?: string; httpStatus?: number; message?: string };

async function mockFeedback(page: Page, opts: { list: Resp; submit?: Resp; onSubmit?: (body: unknown) => void }) {
  const fulfill = (route: Route, r: Resp) => {
    if (r.errorCode) {
      return route.fulfill({ status: r.httpStatus ?? 400, contentType: "application/json", body: JSON.stringify({ error: { json: { message: r.message ?? "error", data: { code: r.errorCode } } } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { data: { json: r.json } } }) });
  };
  await page.route("**/api/trpc/feedback.getMyUrgentSubmissions**", (route) => fulfill(route, opts.list));
  await page.route("**/api/trpc/feedback.submitUrgent**", (route) => {
    const raw = route.request().postData() ?? "{}";
    try {
      opts.onSubmit?.(JSON.parse(raw));
    } catch {
      opts.onSubmit?.(null);
    }
    return fulfill(route, opts.submit ?? { json: { id: "new", kind: "feedback", message: "ok", status: "aperto", createdAt: "2026-06-20T10:00:00Z" } });
  });
}

const open = (page: Page) => page.goto("/portal/feedback-e2e");

test.describe("Patient urgent-feedback screen", () => {
  test("(a) renders the form + the empty submissions list", async ({ page }) => {
    await mockFeedback(page, { list: { json: [] } });
    await open(page);
    await expect(page.getByText("Di cosa si tratta?")).toBeVisible();
    await expect(page.getByLabel("Descrivi la situazione")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invia al coach" })).toBeVisible();
    await expect(page.getByText("Non è una chat: la risposta non è immediata.")).toBeVisible();
    await expect(page.getByText("Nessuna segnalazione")).toBeVisible();
  });

  test("(b) choosing 'infortunio' reveals the structured injury fields", async ({ page }) => {
    await mockFeedback(page, { list: { json: [] } });
    await open(page);
    await expect(page.getByText("Zona interessata")).toHaveCount(0);
    await page.getByRole("radio", { name: /Infortunio/ }).check();
    await expect(page.getByText("Zona interessata")).toBeVisible();
    await expect(page.getByLabel("Gravità")).toBeVisible();
    await expect(page.getByLabel("Data di insorgenza")).toBeVisible();
  });

  test("(c) submitting sends the right payload and shows the warm, not-a-chat confirmation", async ({ page }) => {
    let body: unknown = null;
    await mockFeedback(page, { list: { json: [] }, onSubmit: (b) => (body = b) });
    await open(page);
    await page.getByLabel("Descrivi la situazione").fill("Mi sento molto stanco");
    await page.getByRole("button", { name: "Invia al coach" }).click();
    await expect(page.getByRole("heading", { name: /Roberto è stato avvisato/ })).toBeVisible();
    await expect(page.getByText(/non riceverai una risposta immediata/i)).toBeVisible();
    expect((body as { json?: { message?: string; kind?: string } })?.json?.message).toBe("Mi sento molto stanco");
    expect((body as { json?: { kind?: string } })?.json?.kind).toBe("feedback");
  });

  test("(d) an empty message is blocked with a warm validation message", async ({ page }) => {
    let submitted = false;
    await mockFeedback(page, { list: { json: [] }, onSubmit: () => (submitted = true) });
    await open(page);
    await page.getByRole("button", { name: "Invia al coach" }).click();
    await expect(page.getByText(/Scrivi un messaggio per il tuo coach/)).toBeVisible();
    expect(submitted).toBe(false);
  });

  test("(e) injury requires the structured fields", async ({ page }) => {
    await mockFeedback(page, { list: { json: [] } });
    await open(page);
    await page.getByRole("radio", { name: /Infortunio/ }).check();
    await page.getByLabel("Descrivi cosa è successo").fill("Mi fa male");
    await page.getByRole("button", { name: "Invia al coach" }).click();
    await expect(page.getByText("Indica la zona interessata.")).toBeVisible();
  });

  test("(f) past submissions render with their status", async ({ page }) => {
    await mockFeedback(page, {
      list: {
        json: [
          { id: "s1", kind: "infortunio", message: "Dolore al ginocchio", status: "aperto", createdAt: "2026-06-20T10:00:00Z", injury: { area: "ginocchio destro", severity: "moderata", onsetDate: "2026-06-20" } },
          { id: "s2", kind: "feedback", message: "Stanco ma ok", status: "gestito", createdAt: "2026-06-10T10:00:00Z" },
        ],
      },
    });
    await open(page);
    await expect(page.getByText("Dolore al ginocchio")).toBeVisible();
    await expect(page.getByText("Aperto")).toBeVisible();
    await expect(page.getByText("Gestito")).toBeVisible();
  });
});
