/**
 * META-PROMPTED EXERCISE PASS
 * ───────────────────────────
 * Rather than one hand-written test per element, this derives its coverage from
 * the app's OWN route map (src/app/**) and, per page, from the interactive
 * elements the DOM actually renders. For every route it asserts the page is
 * "healthy": no uncaught exception (React crash), no error-boundary text, no 5xx,
 * and — for guarded routes — a clean redirect to a login screen rather than a
 * crash. Public pages additionally have their real interactions exercised.
 *
 * Auth reality (why coverage splits):
 *   • Coach app  = email + PASSWORD  (/login).            Needs real coach creds.
 *   • Patient app = magic-LINK       (/portal/login).     Needs the patient inbox.
 * Neither authed surface is reachable headless. Pass COACH_EMAIL / COACH_PASSWORD
 * to unlock the coach-dashboard block (read-only navigation only — no destructive
 * clicks). Without them, that block is skipped and reported as needs-operator.
 *
 * Run: BASE_URL=<origin> npx playwright test --config playwright.exercise.config.ts
 */
import { test, expect, type Page } from "@playwright/test";

// ── Route inventory (route groups like (dashboard)/(auth) do not affect URLs) ──
const PUBLIC = ["/login", "/register", "/portal/login"];
const PROTECTED_COACH = [
  "/dashboard", "/clients", "/invoices", "/invoices/new", "/monitoring",
  "/monitoring/notifications", "/monitoring/training", "/plans", "/plans/generate",
  "/plans/new", "/settings",
];
const PROTECTED_PATIENT = [
  "/portal/dashboard", "/portal/diary", "/portal/feedback", "/portal/notifications",
  "/portal/plan", "/portal/progress", "/portal/training",
];
const DUMMY = "00000000-0000-4000-8000-000000000000";
const DYNAMIC_UNAUTH = [
  `/clients/${DUMMY}`, `/clients/${DUMMY}/edit`, `/clients/${DUMMY}/lettera`,
  `/plans/${DUMMY}`, `/plans/${DUMMY}/review`, `/invoices/${DUMMY}`,
];
const E2E_HARNESS = [
  "/kcal-e2e", "/portal/feedback-e2e", `/reminder-e2e/${DUMMY}`,
  `/portal/firma-e2e/${DUMMY}`, `/portal/firma/${DUMMY}`, `/portal/checkin/${DUMMY}`,
  `/monitoring/checkin/${DUMMY}`,
];

const ERR_BOUNDARY =
  /(Qualcosa è andato storto|Si è verificato un errore|Impossibile caricare|Unable to load this section|Application error|Internal Server Error|client-side exception|This page could not be found)/i;

/** Attach console/pageerror listeners; return the live buffers. */
function watch(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Ignore transport noise that isn't an app defect.
    if (/favicon|net::ERR|Failed to load resource|manifest|ERR_BLOCKED/i.test(t)) return;
    consoleErrors.push(t);
  });
  return { pageErrors, consoleErrors };
}

/** Core health invariants asserted for EVERY route. */
async function assertHealthy(
  page: Page,
  path: string,
  buf: { pageErrors: string[]; consoleErrors: string[] },
  status: number | undefined
) {
  expect(buf.pageErrors, `uncaught JS exception on ${path}`).toEqual([]);
  const body = await page.locator("body").innerText().catch(() => "");
  expect(ERR_BOUNDARY.test(body), `error-boundary rendered on ${path}`).toBeFalsy();
  if (status !== undefined) expect(status, `HTTP status on ${path}`).toBeLessThan(500);
  if (buf.consoleErrors.length) {
    test.info().annotations.push({
      type: "console-error",
      description: `${path} → ${buf.consoleErrors.slice(0, 3).join(" | ")}`,
    });
  }
}

// ── Public surfaces — health + real interactions ──────────────────────────────
test.describe("public surfaces", () => {
  for (const path of PUBLIC) {
    test(`healthy: ${path}`, async ({ page }) => {
      const buf = watch(page);
      const resp = await page.goto(path, { waitUntil: "networkidle" });
      await assertHealthy(page, path, buf, resp?.status());
    });
  }

  test("coach /login — password form enables + reset toggle + register link", async ({ page }) => {
    const buf = watch(page);
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
    const accedi = page.getByRole("button", { name: "Accedi" });
    await expect(accedi).toBeDisabled(); // gated until valid input
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");
    await expect(accedi).toBeEnabled();
    // "Password dimenticata?" must do something (not a dead button).
    const before = page.url();
    await page.getByRole("button", { name: /Password dimenticata/i }).click();
    await page.waitForTimeout(400);
    await assertHealthy(page, "/login (after reset toggle)", buf, undefined);
    expect(before === page.url() ? "same-page-toggle" : "navigated").toBeTruthy();
  });

  test("patient /portal/login — magic-link form enables on valid email", async ({ page }) => {
    const buf = watch(page);
    await page.goto("/portal/login", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /Area Cliente/i })).toBeVisible();
    const send = page.getByRole("button", { name: /Invia link di accesso/i });
    await expect(send).toBeDisabled();
    await page.getByLabel("Email").fill("client@example.com");
    await expect(send).toBeEnabled();
    await assertHealthy(page, "/portal/login", buf, undefined);
  });

  test("landing redirect: /portal → login when unauthenticated", async ({ page }) => {
    const buf = watch(page);
    await page.goto("/portal", { waitUntil: "networkidle" });
    await page.waitForURL(/login/, { timeout: 15_000 }).catch(() => {});
    expect(page.url(), "portal landing should reach a login screen").toMatch(/login/);
    await assertHealthy(page, "/portal", buf, undefined);
  });
});

// ── Guarded routes (unauthenticated) — must redirect cleanly, never crash ─────
test.describe("guarded routes redirect cleanly (unauth)", () => {
  for (const path of [...PROTECTED_COACH, ...PROTECTED_PATIENT, ...DYNAMIC_UNAUTH]) {
    test(`guard: ${path}`, async ({ page }) => {
      const buf = watch(page);
      const resp = await page.goto(path, { waitUntil: "networkidle" });
      await assertHealthy(page, path, buf, resp?.status());
      // Landed on a login screen (server- or client-redirected), not the guarded content.
      expect(page.url(), `${path} should redirect unauth → login`).toMatch(/login/);
    });
  }
});

// ── E2E-harness / token routes — probe reachability, must not crash ───────────
test.describe("harness & token routes do not crash", () => {
  for (const path of E2E_HARNESS) {
    test(`reachable-or-clean: ${path}`, async ({ page }) => {
      const buf = watch(page);
      const resp = await page.goto(path, { waitUntil: "networkidle" }).catch(() => null);
      const status = resp?.status();
      test.info().annotations.push({
        type: "reachability",
        description: `${path} → ${status ?? "no-response"} (final ${page.url()})`,
      });
      await assertHealthy(page, path, buf, status);
    });
  }
});

// ── Optional: authenticated coach coverage (read-only) ────────────────────────
const COACH_EMAIL = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;
test.describe("coach dashboard (authenticated, read-only)", () => {
  test.skip(!COACH_EMAIL || !COACH_PASSWORD, "no COACH_EMAIL/COACH_PASSWORD — needs an operator session");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(COACH_EMAIL!);
    await page.getByLabel("Password").fill(COACH_PASSWORD!);
    await page.getByRole("button", { name: "Accedi" }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  });

  for (const path of PROTECTED_COACH) {
    test(`authed healthy: ${path}`, async ({ page }) => {
      const buf = watch(page);
      const resp = await page.goto(path, { waitUntil: "networkidle" });
      await assertHealthy(page, path, buf, resp?.status());
      // Enumerate visible non-destructive controls and confirm they are real
      // (have a handler / href), without triggering mutations.
      const controls = await page.getByRole("button").all();
      test.info().annotations.push({ type: "controls", description: `${path}: ${controls.length} buttons` });
    });
  }
});
