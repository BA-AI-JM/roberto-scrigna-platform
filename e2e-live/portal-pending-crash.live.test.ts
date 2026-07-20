/**
 * T2-C live spec — G22: the portal dashboard must survive pending / null-date check-ins.
 * Requires: supabase local up + dev server on :3001. Run: bun test e2e-live/
 * (Deliberately outside vitest's src/** include — this is the live tier, not the 1.7s unit tier.)
 *
 * ── STATUS AT AUTHORING (2026-07-20) — READ THIS ─────────────────────────────
 * The register (G22) expected this spec RED. It is GREEN, because Terminal 1 landed the
 * fix mid-session: commit 1979df7 "fix(portal): pending check-ins no longer crash the
 * dashboard (T1.3, G22)". The feed now guards at src/server/routers/portal.ts:286-287:
 *     .eq("status", "completed").not("check_in_date", "is", null)
 * so pending rows (NULL check_in_date) never reach the client render. This spec therefore
 * stands as the REGRESSION LOCK the G22 route called for ("regression test with a pending
 * row"): it proves the guard holds against a live pending row AND a completed null-date row.
 *
 * PRE-FIX MECHANISM (verified at line level, do not lose): getDashboardData returned the raw
 * check_in rows unfiltered; the client page mapped {date: check_in_date} and, because the
 * withWeight filter (dashboard/page.tsx:202) keys on weight NOT date, a row with weight but a
 * null date reached page.tsx:239 `p.date.slice(0, 10)` — and new Date(null).getTime()===0 is
 * NOT NaN, so the :238 guard passed and `null.slice` threw
 * "TypeError: Cannot read properties of null (reading 'slice')".
 *
 * DEFENSE-IN-DEPTH GAP (append candidate, NOT fixed by T1.3): the page-side crash site
 * dashboard/page.tsx:239 is STILL unguarded — T1.3 fixed only the feed. If any other path
 * feeds a null date to that map, the client render crashes again. Flagged in TERMINAL2-REPORT.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";

const SB = "http://127.0.0.1:54321";
const APP = "http://localhost:3001";
const SK = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"; // supabase-local well-known dev key
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
// @supabase/ssr default cookie: sb-<projectRef>-auth-token; projectRef for local (127.0.0.1) = "127".
const AUTH_COOKIE_NAME = "sb-127-auth-token";

// Niccolò Ambrosi — the seeded portal-capable client (auth_user_id set, status active).
const CLIENT_ID = "6cab145c-0eb6-438e-bc32-c0e8193fa6e8";
const AUTH_UID = "02bb1dc2-d256-44a8-8bb3-7e7e8da716fe";

const b64url = (s: string) => Buffer.from(s).toString("base64url");

let up = false;
let partnerId: string | null = null;
const seededIds: string[] = [];

/** Mint a real portal-client session cookie via GoTrue admin magic-link (no browser, no PKCE). */
async function mintPortalCookie(): Promise<string | null> {
  const u = await (await fetch(`${SB}/auth/v1/admin/users/${AUTH_UID}`, { headers: H })).json();
  if (!u?.email) return null;
  const gl = await (
    await fetch(`${SB}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ type: "magiclink", email: u.email }),
    })
  ).json();
  const hashed = gl.hashed_token ?? gl.properties?.hashed_token;
  if (!hashed) return null;
  const ver = await fetch(`${SB}/auth/v1/verify?token=${hashed}&type=magiclink`, { redirect: "manual" });
  const qp = new URLSearchParams((ver.headers.get("location") ?? "").split("#")[1] ?? "");
  const access = qp.get("access_token");
  const refresh = qp.get("refresh_token");
  if (!access || !refresh) return null;
  const user = await (await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: `Bearer ${access}` } })).json();
  const session = {
    access_token: access,
    refresh_token: refresh,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  return `${AUTH_COOKIE_NAME}=base64-${b64url(JSON.stringify(session))}`;
}

async function seedCheckin(row: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`${SB}/rest/v1/check_in`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ client_id: CLIENT_ID, partner_id: partnerId, ...row }),
  });
  const body = await res.json();
  const id = Array.isArray(body) ? body[0]?.id : body?.id;
  if (id) seededIds.push(id);
  return id ?? null;
}

beforeAll(async () => {
  up = await fetch(`${APP}/login`).then((r) => r.ok).catch(() => false);
  if (!up) return;
  const client = await (await fetch(`${SB}/rest/v1/client?id=eq.${CLIENT_ID}&select=partner_id`, { headers: H })).json();
  partnerId = client?.[0]?.partner_id ?? null;
  if (!partnerId) return;
  // The two rows that reproduced G22 pre-fix:
  //  (a) a normal weekly-cycle PENDING row (null date, null weight);
  //  (b) a COMPLETED row with a null date but a real weight — the exact shape that reached
  //      page.tsx:239 `p.date.slice` because the page's weight-filter let it through.
  await seedCheckin({ status: "pending", check_in_date: null });
  await seedCheckin({ status: "completed", check_in_date: null, weight_kg: 80 });
});

afterAll(async () => {
  for (const id of seededIds) {
    await fetch(`${SB}/rest/v1/check_in?id=eq.${id}`, { method: "DELETE", headers: H });
  }
});

test("G22 pre-condition: the crash-shape rows really are in the DB (guard is what protects the page)", async () => {
  if (!up) { console.warn("SKIP: dev server not running on :3001"); return; }
  expect(partnerId).toBeTruthy();
  const rows = await (
    await fetch(`${SB}/rest/v1/check_in?client_id=eq.${CLIENT_ID}&check_in_date=is.null&select=id,status,weight_kg`, { headers: H })
  ).json();
  // At least our two seeds (a pending, and a completed-with-weight) exist with null dates.
  expect(Array.isArray(rows)).toBe(true);
  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows.some((r: { status: string; weight_kg: number | null }) => r.status === "completed" && r.weight_kg != null)).toBe(true);
});

test("G22: getDashboardData weightTrend excludes every null check_in_date row (T1.3 feed guard)", async () => {
  if (!up) { console.warn("SKIP: dev server not running on :3001"); return; }
  const cookie = await mintPortalCookie();
  expect(cookie, "could not mint a portal session — auth flow changed?").toBeTruthy();

  const res = await fetch(`${APP}/api/trpc/portal.getDashboardData`, { headers: { Cookie: cookie! } });
  expect(res.status).toBe(200);
  const payload = (await res.json())?.result?.data?.json;
  const trend = payload?.weightTrend;
  expect(Array.isArray(trend), "weightTrend should be an array").toBe(true);

  // THE invariant. Pre-1979df7 this was RED (pending/null-date rows were returned and the
  // client crashed at page.tsx:239). Post-fix: zero null-date entries reach the client.
  const nullDates = (trend as Array<{ check_in_date: string | null }>).filter((e) => e.check_in_date == null);
  expect(nullDates.length, `weightTrend leaked ${nullDates.length} null-date row(s) — G22 regression`).toBe(0);
});

test("G22: the authenticated portal dashboard route renders without a server error", async () => {
  if (!up) { console.warn("SKIP: dev server not running on :3001"); return; }
  const cookie = await mintPortalCookie();
  expect(cookie).toBeTruthy();
  const res = await fetch(`${APP}/portal/dashboard`, { headers: { Cookie: cookie! }, redirect: "manual" });
  // The dashboard is a client component (data loads post-hydration), so a fetch sees the shell;
  // this asserts the route itself is healthy (auth OK, no 5xx) with the crash-shape rows present.
  // The client-render crash path is closed at the feed by T1.3 (asserted above).
  expect(res.status).toBeLessThan(500);
});
