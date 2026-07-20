/**
 * T2-F live spec — authenticated portal render tier (register G27 / plan T2.1 first slice).
 * Requires: supabase local up + dev server on :3001 + chromium (playwright). Run: bun test e2e-live/
 *
 * This is the BROWSER tier the lane-1 report flagged as necessary: the portal dashboard is a
 * "use client" component whose data loads via client-side tRPC AFTER hydration, so a bun+fetch
 * spec only ever sees the pre-hydration shell. Here we drive a real chromium so the client
 * render actually executes — the only way to prove G22's render crash is truly closed.
 *
 * Fully self-provisioning (the DB was reseeded mid-arc — no portal auth links, no plans):
 *   • creates a portal auth user and links it to the seed client (Niccolò),
 *   • coach-generates + approves a real plan for that client (via tRPC),
 *   • seeds the exact G22 crash-shape check_in (completed, null check_in_date, real weight),
 *   • injects the client session cookie into chromium,
 * and tears every bit of it down in afterAll.
 *
 * Coverage:
 *   1. G22 RENDER LOCK — /portal/dashboard renders WITHOUT the error boundary despite a
 *      crash-shape check_in present (would crash at dashboard/page.tsx:239 pre-T1.3).
 *   2. /portal/plan renders the active plan's meals.
 *   3. first_viewed_at (T1.6b) — viewing /portal/plan sets the marker (portal.ts:147-164).
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type BrowserContext } from "playwright";

const SB = "http://127.0.0.1:54321";
const BASE = "http://localhost:3001";
const SK = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const SVC = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const AUTH_COOKIE_NAME = "sb-127-auth-token";
const ERROR_BOUNDARY = "Si è verificato un errore"; // portal/error.tsx heading

const CLIENT_ID = "9dacdf1b-a9b2-4881-8049-f241ebea53ec"; // Niccolò Ambrosi (has a snapshot)
const COACH = { email: "roberto@test.com", password: "testpass123" };
const PORTAL_EMAIL = "t2f-portal@example.test";
const PORTAL_PASSWORD = "T2fPortalPass123!";
const b64url = (s: string) => Buffer.from(s).toString("base64url");

let up = false;
let ready = false;
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let partnerId: string | null = null;
let portalUid: string | null = null;
let planId: string | null = null;
let portalCookieValue: string | null = null; // for the fetch-level feed-contract test
const seededCheckinIds: string[] = [];

async function sessionCookie(email: string, password: string): Promise<string | null> {
  const tok = await (
    await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: SK, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })
  ).json();
  if (!tok?.access_token) return null;
  const user = await (await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: `Bearer ${tok.access_token}` } })).json();
  const session = { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user };
  return `base64-${b64url(JSON.stringify(session))}`;
}

async function trpc(path: string, input: unknown, cookie: string) {
  const res = await fetch(`${BASE}/api/trpc/${path}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ json: input }) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, data: body?.result?.data?.json, error: body?.error?.json ?? body?.error };
}

async function deletePortalUserByEmail() {
  const list = await (await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: SVC })).json();
  const existing = (list?.users ?? []).find((u: { email?: string }) => u.email === PORTAL_EMAIL);
  if (existing) await fetch(`${SB}/auth/v1/admin/users/${existing.id}`, { method: "DELETE", headers: SVC });
}

async function purgeClientPlans() {
  const plans = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${CLIENT_ID}&select=id`, { headers: SVC })).json();
  for (const p of plans ?? []) {
    const rows = await (await fetch(`${SB}/rest/v1/delivery_outbox?select=id&${encodeURIComponent("payload->>planId")}=eq.${p.id}`, { headers: SVC })).json();
    for (const r of rows ?? []) await fetch(`${SB}/rest/v1/delivery_outbox?id=eq.${r.id}`, { method: "DELETE", headers: SVC });
    await fetch(`${SB}/rest/v1/plan?id=eq.${p.id}`, { method: "DELETE", headers: SVC });
  }
}

beforeAll(async () => {
  up = await fetch(`${BASE}/login`).then((r) => r.ok).catch(() => false);
  if (!up) return;
  partnerId = (await (await fetch(`${SB}/rest/v1/client?id=eq.${CLIENT_ID}&select=partner_id`, { headers: SVC })).json())?.[0]?.partner_id ?? null;

  // 1. Provision a portal auth user + link it to the client (makes it portal-capable).
  await deletePortalUserByEmail();
  const created = await (
    await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: SVC, body: JSON.stringify({ email: PORTAL_EMAIL, password: PORTAL_PASSWORD, email_confirm: true }) })
  ).json();
  portalUid = created?.id ?? null;
  if (portalUid) await fetch(`${SB}/rest/v1/client?id=eq.${CLIENT_ID}`, { method: "PATCH", headers: SVC, body: JSON.stringify({ auth_user_id: portalUid }) });

  // 2. Coach-generate + approve a real plan (clean slate first) → active plan for the portal.
  const coach = await sessionCookie(COACH.email, COACH.password);
  if (coach) {
    await purgeClientPlans();
    const gen = await trpc("plan.generate", { clientId: CLIENT_ID }, `${AUTH_COOKIE_NAME}=${coach}`);
    planId = (gen.data?.planId as string) ?? null;
    if (planId) await trpc("plan.approve", { id: planId }, `${AUTH_COOKIE_NAME}=${coach}`);
  }

  // 3. Seed the exact G22 crash shape: completed, null date, real weight (reaches page.tsx:239
  //    pre-fix) + a normal pending row. Both must be excluded by T1.3's feed guard.
  for (const row of [
    { status: "completed", check_in_date: null, weight_kg: 80 },
    { status: "pending", check_in_date: null },
  ]) {
    const seed = await (await fetch(`${SB}/rest/v1/check_in`, { method: "POST", headers: { ...SVC, Prefer: "return=representation" }, body: JSON.stringify({ client_id: CLIENT_ID, partner_id: partnerId, ...row }) })).json();
    const id = Array.isArray(seed) ? seed[0]?.id : seed?.id;
    if (id) seededCheckinIds.push(id);
  }

  // 4. Portal session cookie → chromium.
  const value = await sessionCookie(PORTAL_EMAIL, PORTAL_PASSWORD);
  if (!value) return;
  portalCookieValue = value;
  try {
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: AUTH_COOKIE_NAME, value, url: BASE }]);
    ready = true;
  } catch (e) {
    console.warn("SKIP: chromium launch failed —", String(e).slice(0, 120));
  }
});

afterAll(async () => {
  for (const id of seededCheckinIds) await fetch(`${SB}/rest/v1/check_in?id=eq.${id}`, { method: "DELETE", headers: SVC });
  if (up) await purgeClientPlans();
  // Unlink + delete the provisioned portal user (client.auth_user_id back to null).
  await fetch(`${SB}/rest/v1/client?id=eq.${CLIENT_ID}`, { method: "PATCH", headers: SVC, body: JSON.stringify({ auth_user_id: null }) });
  if (portalUid) await fetch(`${SB}/auth/v1/admin/users/${portalUid}`, { method: "DELETE", headers: SVC });
  if (browser) await browser.close();
});

test("G22 render lock: authenticated /portal/dashboard renders WITHOUT the error boundary", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  if (!ready) { console.warn("SKIP: no browser/session"); return; }
  const page = await context!.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: "networkidle" });
  // Wait until the client render settles — either real content or the error boundary appears.
  await page.getByText(/Check-in|Statistiche|Storico|Piano|Si è verificato/i).first().waitFor({ state: "visible", timeout: 12000 });

  expect(await page.getByText(ERROR_BOUNDARY).count(), "error boundary must NOT render").toBe(0);
  expect(pageErrors.filter((m) => /Cannot read properties of null|reading '?slice'?/i.test(m))).toHaveLength(0);
  expect(await page.getByText(/Check-in|Statistiche|Storico|Piano/i).count(), "portal content should render").toBeGreaterThan(0);
  await page.close();
}, 45000);

test("/portal/plan renders the active plan's meals", async () => {
  if (!up || !ready) { console.warn("SKIP"); return; }
  const page = await context!.newPage();
  await page.goto(`${BASE}/portal/plan`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Il mio piano" }).waitFor({ state: "visible", timeout: 12000 });
  // Meal content rendered from getActivePlan (meal slot names / macro tokens).
  await page.getByText(/Colazione|Pranzo|Cena|Spuntino|Pasto|kcal/i).first().waitFor({ state: "visible", timeout: 12000 });
  expect(await page.getByText(ERROR_BOUNDARY).count(), "error boundary must NOT render").toBe(0);
  await page.close();
}, 45000);

test("first_viewed_at (T1.6b): viewing /portal/plan sets the marker when it was null", async () => {
  if (!up || !ready) { console.warn("SKIP"); return; }
  if (!planId) { console.warn("SKIP: no active plan provisioned"); return; }
  await fetch(`${SB}/rest/v1/plan?id=eq.${planId}`, { method: "PATCH", headers: SVC, body: JSON.stringify({ first_viewed_at: null }) });
  const before = await (await fetch(`${SB}/rest/v1/plan?id=eq.${planId}&select=first_viewed_at`, { headers: SVC })).json();
  expect(before?.[0]?.first_viewed_at).toBeNull();

  const page = await context!.newPage();
  await page.goto(`${BASE}/portal/plan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.close();

  let seen: string | null = null;
  for (let i = 0; i < 12 && !seen; i++) {
    seen = (await (await fetch(`${SB}/rest/v1/plan?id=eq.${planId}&select=first_viewed_at`, { headers: SVC })).json())?.[0]?.first_viewed_at ?? null;
    if (!seen) await new Promise((r) => setTimeout(r, 500));
  }
  expect(seen, "first_viewed_at should be set after the portal plan view").not.toBeNull();
}, 45000);

// G22 feed contract (folds in the lane-1 portal-pending-crash spec, now self-provisioning):
// with the crash-shape check_ins seeded, the dashboard FEED must exclude every null-date row.
// This is the deterministic data-layer companion to the browser render lock above (T1.3 guard,
// portal.ts:286-287). Pre-fix this leaked the null-date rows the client then crashed on.
test("G22 feed contract: getDashboardData weightTrend excludes null-date rows (T1.3)", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  if (!portalCookieValue) { console.warn("SKIP: no portal session"); return; }
  const res = await fetch(`${BASE}/api/trpc/portal.getDashboardData`, { headers: { Cookie: `${AUTH_COOKIE_NAME}=${portalCookieValue}` } });
  expect(res.status).toBe(200);
  const trend = (await res.json())?.result?.data?.json?.weightTrend;
  expect(Array.isArray(trend)).toBe(true);
  const leaked = (trend as Array<{ check_in_date: string | null }>).filter((e) => e.check_in_date == null);
  expect(leaked.length, `weightTrend leaked ${leaked.length} null-date row(s) — G22 regression`).toBe(0);
}, 30000);
