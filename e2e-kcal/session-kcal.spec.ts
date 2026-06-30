import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Session kcal estimate + override behaviour E2E — UI behaviour with the
 * override tRPC call MOCKED. Drives the REAL <WeekSessionsEditor> via the
 * env-gated harness route (no DB / Supabase). Seeded session: Pesi — Forza,
 * 60 min, RPE 5 @ 80 kg → provisional estimate 204 kcal. A real-DB run is gated
 * on the test-DB/staging setup (v1.5) and is NOT claimed here.
 */

async function mockOverride(page: Page, onPost?: (body: unknown) => void) {
  await page.route("**/api/trpc/trainingLog.setSessionKcalOverride**", (route: Route) => {
    const raw = route.request().postData() ?? "{}";
    try {
      onPost?.(JSON.parse(raw));
    } catch {
      onPost?.(null);
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { data: { json: null } } }) });
  });
}

const open = (page: Page) => page.goto("/kcal-e2e");

test.describe("Session kcal estimate + override", () => {
  test("(a) renders the provisional estimate badge", async ({ page }) => {
    await mockOverride(page);
    await open(page);
    await expect(page.getByText(/~204 kcal/)).toBeVisible();
    await expect(page.getByText("stimato")).toBeVisible();
    await expect(page.getByLabel("kcal personalizzato")).toBeVisible();
  });

  test("(b) an override saves via the adapter and supersedes the estimate", async ({ page }) => {
    let body: unknown = null;
    await mockOverride(page, (b) => (body = b));
    await open(page);

    await page.getByLabel("kcal personalizzato").fill("350");
    await page.getByRole("button", { name: "Salva" }).click();

    await expect(page.getByText("350 kcal")).toBeVisible();
    await expect(page.getByText("modificato")).toBeVisible();
    await expect(page.getByText(/~204 stimato/)).toBeVisible(); // estimate shown struck, not gone
    expect((body as { json?: { sessionId?: string; kcalOverride?: number } })?.json).toEqual({ sessionId: "0:0", kcalOverride: 350 });
  });

  test("(c) clearing the override reverts to the estimate", async ({ page }) => {
    const bodies: unknown[] = [];
    await mockOverride(page, (b) => bodies.push(b));
    await open(page);

    await page.getByLabel("kcal personalizzato").fill("350");
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("modificato")).toBeVisible();

    await page.getByRole("button", { name: "Rimuovi" }).click();
    await expect(page.getByText("modificato")).toHaveCount(0);
    await expect(page.getByText(/~204 kcal/)).toBeVisible();
    expect((bodies[bodies.length - 1] as { json?: { kcalOverride?: number | null } })?.json?.kcalOverride).toBeNull();
  });

  test("(d) a non-positive override is blocked with a validation message", async ({ page }) => {
    let posted = false;
    await mockOverride(page, () => (posted = true));
    await open(page);

    await page.getByLabel("kcal personalizzato").fill("0");
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Inserisci un numero positivo.")).toBeVisible();
    expect(posted).toBe(false);
  });
});
