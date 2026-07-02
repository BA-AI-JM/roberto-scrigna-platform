/**
 * Exercise-pass global setup: establish a REAL coach session against the LOCAL
 * Supabase (the project's own e2e account roberto@test.com, seeded locally) and
 * save storageState for the interaction crawl. Requires local Supabase + the env
 * from e2e-exercise/.localenv (see README-exercise.md). Not run in CI.
 */
import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(_config: FullConfig) {
  const base = "http://localhost:3220";
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForSelector("#email", { state: "visible", timeout: 30000 });
  await page.locator("#email").fill("roberto@test.com");
  await page.locator("#password").fill("testpass123");
  await page.getByRole("button", { name: "Accedi", exact: true }).click({ timeout: 15000 });
  // Coach lands on the dashboard (or clients) once the session is set.
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const url = page.url();
  if (url.includes("/login")) {
    const err = await page.locator("body").innerText().catch(() => "");
    throw new Error(`Coach login did not leave /login — is local Supabase seeded? body: ${err.slice(0, 160)}`);
  }
  await page.context().storageState({ path: "e2e-exercise/.auth.json" });
  await browser.close();
}
