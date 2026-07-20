/**
 * Authenticated portal render tier (register G27 / plan T2.1 first slice). Browser tier.
 * Requires: supabase local up + dev server on :3001 + chromium (playwright). Run: bun test e2e-live/
 *
 * The portal dashboard is a "use client" component whose data loads via client-side tRPC AFTER
 * hydration, so a bun+fetch spec only sees the shell — this drives a real chromium so the client
 * render actually executes (the true G22 render lock).
 *
 * Lane-3: refactored onto the shared throwaway spine (_provision) so the seed clients Niccolò/
 * Raphael are READ-ONLY — every write targets a throwaway created + torn down this run.
 *
 * Coverage: (1) G22 render lock — dashboard renders WITHOUT the error boundary despite a
 * crash-shape check_in; (2) /portal/plan renders meals; (3) first_viewed_at set on view
 * (T1.6b); (4) getDashboardData feed excludes null-date rows (T1.3).
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { SB, APP, SVC, AUTH_COOKIE_NAME, devUp, provisionThrowaway, teardownThrowaway, type Throwaway } from "./_provision";

const ERROR_BOUNDARY = "Si è verificato un errore"; // portal/error.tsx heading

let up = false;
let ready = false;
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let t: Throwaway | null = null;

beforeAll(async () => {
  up = await devUp();
  if (!up) return;
  t = await provisionThrowaway({ withPortalUser: true, withPlan: true, fullName: "T2 Portal Test" });
  // Seed the exact G22 crash shape (completed, null date, real weight) + a pending row.
  for (const row of [
    { status: "completed", check_in_date: null, weight_kg: 80 },
    { status: "pending", check_in_date: null },
  ]) {
    await fetch(`${SB}/rest/v1/check_in`, { method: "POST", headers: SVC, body: JSON.stringify({ client_id: t.clientId, partner_id: t.partnerId, ...row }) });
  }
  if (!t.portalCookieValue) return;
  try {
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: AUTH_COOKIE_NAME, value: t.portalCookieValue, url: APP }]);
    ready = true;
  } catch (e) {
    console.warn("SKIP: chromium launch failed —", String(e).slice(0, 120));
  }
});

afterAll(async () => {
  if (browser) await browser.close();
  if (t) await teardownThrowaway(t);
});

test("G22 render lock: authenticated /portal/dashboard renders WITHOUT the error boundary", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  if (!ready) { console.warn("SKIP: no browser/session"); return; }
  const page = await context!.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`${APP}/portal/dashboard`, { waitUntil: "networkidle" });
  await page.getByText(/Check-in|Statistiche|Storico|Piano|Si è verificato/i).first().waitFor({ state: "visible", timeout: 12000 });

  expect(await page.getByText(ERROR_BOUNDARY).count(), "error boundary must NOT render").toBe(0);
  expect(pageErrors.filter((m) => /Cannot read properties of null|reading '?slice'?/i.test(m))).toHaveLength(0);
  expect(await page.getByText(/Check-in|Statistiche|Storico|Piano/i).count(), "portal content should render").toBeGreaterThan(0);
  await page.close();
}, 45000);

test("/portal/plan renders the active plan's meals", async () => {
  if (!up || !ready) { console.warn("SKIP"); return; }
  const page = await context!.newPage();
  await page.goto(`${APP}/portal/plan`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Il mio piano" }).waitFor({ state: "visible", timeout: 12000 });
  await page.getByText(/Colazione|Pranzo|Cena|Spuntino|Pasto|kcal/i).first().waitFor({ state: "visible", timeout: 12000 });
  expect(await page.getByText(ERROR_BOUNDARY).count(), "error boundary must NOT render").toBe(0);
  await page.close();
}, 45000);

test("first_viewed_at (T1.6b): viewing /portal/plan sets the marker when it was null", async () => {
  if (!up || !ready) { console.warn("SKIP"); return; }
  if (!t?.planId) { console.warn("SKIP: no active plan provisioned"); return; }
  await fetch(`${SB}/rest/v1/plan?id=eq.${t.planId}`, { method: "PATCH", headers: SVC, body: JSON.stringify({ first_viewed_at: null }) });
  const before = await (await fetch(`${SB}/rest/v1/plan?id=eq.${t.planId}&select=first_viewed_at`, { headers: SVC })).json();
  expect(before?.[0]?.first_viewed_at).toBeNull();

  const page = await context!.newPage();
  await page.goto(`${APP}/portal/plan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.close();

  let seen: string | null = null;
  for (let i = 0; i < 12 && !seen; i++) {
    seen = (await (await fetch(`${SB}/rest/v1/plan?id=eq.${t.planId}&select=first_viewed_at`, { headers: SVC })).json())?.[0]?.first_viewed_at ?? null;
    if (!seen) await new Promise((r) => setTimeout(r, 500));
  }
  expect(seen, "first_viewed_at should be set after the portal plan view").not.toBeNull();
}, 45000);

test("G22 feed contract: getDashboardData weightTrend excludes null-date rows (T1.3)", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  if (!t?.portalCookieValue) { console.warn("SKIP: no portal session"); return; }
  const res = await fetch(`${APP}/api/trpc/portal.getDashboardData`, { headers: { Cookie: `${AUTH_COOKIE_NAME}=${t.portalCookieValue}` } });
  expect(res.status).toBe(200);
  const trend = (await res.json())?.result?.data?.json?.weightTrend;
  expect(Array.isArray(trend)).toBe(true);
  const leaked = (trend as Array<{ check_in_date: string | null }>).filter((e) => e.check_in_date == null);
  expect(leaked.length, `weightTrend leaked ${leaked.length} null-date row(s) — G22 regression`).toBe(0);
}, 30000);
