import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Reminder-settings card behaviour E2E — UI behaviour with MOCKED data.
 *
 * Drives the REAL <ReminderSettingsCard> via the env-gated harness route; the
 * reminder tRPC calls are intercepted (no DB / Supabase). A true end-to-end pass
 * against a real DB is gated on the test-DB/staging setup (a v1.5 infra item)
 * and is NOT claimed here.
 */

const CID = "11111111-1111-1111-1111-111111111111";
type Resp = { json?: unknown; errorCode?: string; httpStatus?: number; message?: string };

async function mockReminders(
  page: Page,
  opts: { get: Resp; update?: Resp; onUpdate?: (body: unknown) => void }
) {
  const fulfill = (route: Route, r: Resp) => {
    if (r.errorCode) {
      return route.fulfill({
        status: r.httpStatus ?? 400,
        contentType: "application/json",
        body: JSON.stringify({ error: { json: { message: r.message ?? "error", data: { code: r.errorCode } } } }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { data: { json: r.json } } }) });
  };
  await page.route("**/api/trpc/notification.getReminderSettings**", (route) => fulfill(route, opts.get));
  await page.route("**/api/trpc/notification.updateReminderSettings**", (route) => {
    const raw = route.request().postData() ?? "{}";
    try {
      opts.onUpdate?.(JSON.parse(raw));
    } catch {
      opts.onUpdate?.(null);
    }
    return fulfill(route, opts.update ?? opts.get);
  });
}

const ENABLED = { checkInEveryDays: 14, bodyCompEveryDays: 28, enabled: true };
const open = (page: Page) => page.goto(`/reminder-e2e/${CID}`);

test.describe("Coach reminder-settings card", () => {
  test("(a) renders pre-filled with the effective cadence in plain Italian", async ({ page }) => {
    await mockReminders(page, { get: { json: ENABLED } });
    await open(page);

    await expect(page.getByLabel("Check-in (giorni)")).toHaveValue("14");
    await expect(page.getByLabel("Composizione corporea (giorni)")).toHaveValue("28");
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Check-in ogni 14 giorni")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salva promemoria" })).toBeVisible();
  });

  test("(b) saving sends the edited values and shows success", async ({ page }) => {
    let captured: unknown = null;
    await mockReminders(page, {
      get: { json: ENABLED },
      update: { json: { ...ENABLED, checkInEveryDays: 21 } },
      onUpdate: (b) => (captured = b),
    });
    await open(page);

    await page.getByLabel("Check-in (giorni)").fill("21");
    await page.getByRole("button", { name: "Salva promemoria" }).click();
    await expect(page.getByText("Promemoria aggiornati")).toBeVisible();

    expect((captured as { json?: { checkInEveryDays?: number; clientId?: string } })?.json?.checkInEveryDays).toBe(21);
    expect((captured as { json?: { clientId?: string } })?.json?.clientId).toBe(CID);
  });

  test("(c) toggling reminders off deactivates the cadence inputs", async ({ page }) => {
    await mockReminders(page, { get: { json: ENABLED } });
    await open(page);

    await page.getByRole("switch").click();
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByLabel("Check-in (giorni)")).toBeDisabled();
    await expect(page.getByText("Promemoria disattivati")).toBeVisible();
  });

  test("(d) out-of-range cadence surfaces a validation message and blocks save", async ({ page }) => {
    let saveCalled = false;
    await mockReminders(page, { get: { json: ENABLED }, onUpdate: () => (saveCalled = true) });
    await open(page);

    await page.getByLabel("Check-in (giorni)").fill("0");
    await expect(page.getByText(/tra 1 e 90 giorni/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Salva promemoria" })).toBeDisabled();
    expect(saveCalled).toBe(false);
  });

  test("(e) a permission error renders a friendly message, no crash", async ({ page }) => {
    await mockReminders(page, { get: { errorCode: "FORBIDDEN", httpStatus: 403, message: "no" } });
    await open(page);

    await expect(page.getByText(/non hai i permessi/i)).toBeVisible();
  });
});
