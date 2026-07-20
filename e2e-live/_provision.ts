/**
 * Shared live-tier provisioning spine (Terminal-2 lanes 2-3). NOT a test file (no `.test`)
 * — bun's test runner ignores it; specs + scripts import it.
 *
 * SAFETY RAIL (non-negotiable, lane-3): the seed clients Niccolò (TEMPLATE_CLIENT_ID) and
 * Raphael are READ-ONLY. We only ever SELECT the template snapshot to copy its clinical
 * values into a brand-new THROWAWAY client. Every write targets a client this module created.
 */

export const SB = "http://127.0.0.1:54321";
export const APP = "http://localhost:3001";
export const SK = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"; // supabase-local well-known dev key
export const SVC = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
export const AUTH_COOKIE_NAME = "sb-127-auth-token"; // @supabase/ssr default for local (127.0.0.1)
export const COACH = { email: "roberto@test.com", password: "testpass123" };
/** Niccolò Ambrosi — the one seed client with a snapshot the engine can generate from. READ-ONLY. */
export const TEMPLATE_CLIENT_ID = "9dacdf1b-a9b2-4881-8049-f241ebea53ec";

const b64url = (s: string) => Buffer.from(s).toString("base64url");

export async function devUp(): Promise<boolean> {
  return fetch(`${APP}/login`).then((r) => r.ok).catch(() => false);
}

/** Build an @supabase/ssr session cookie VALUE (without the name=) for a GoTrue session. */
async function cookieValueFromTokens(access: string, refresh: string): Promise<string> {
  const user = await (await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: `Bearer ${access}` } })).json();
  const session = { access_token: access, refresh_token: refresh, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user };
  return `base64-${b64url(JSON.stringify(session))}`;
}

/** Password-grant session → cookie value. */
export async function sessionCookieValue(email: string, password: string): Promise<string | null> {
  const tok = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: SK, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  if (!tok?.access_token) return null;
  return cookieValueFromTokens(tok.access_token, tok.refresh_token);
}

/** Full `sb-127-auth-token=...` cookie string for the coach (Roberto). */
export async function coachCookie(): Promise<string | null> {
  const v = await sessionCookieValue(COACH.email, COACH.password);
  return v ? `${AUTH_COOKIE_NAME}=${v}` : null;
}

/** POST a tRPC mutation (superjson single, not batched). */
export async function trpc(path: string, input: unknown, cookie: string) {
  const res = await fetch(`${APP}/api/trpc/${path}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ json: input }) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, data: body?.result?.data?.json, error: body?.error?.json ?? body?.error };
}

/** GET a tRPC query (superjson). */
export async function trpcQuery(path: string, input: unknown, cookie: string) {
  const q = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await fetch(`${APP}/api/trpc/${path}${q}`, { headers: { Cookie: cookie } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, data: body?.result?.data?.json, error: body?.error?.json ?? body?.error };
}

export interface Throwaway {
  clientId: string;
  partnerId: string;
  authUid: string | null;
  email: string;
  password: string;
  planId: string | null;
  portalCookieValue: string | null;
  extraCheckinIds: string[];
  extraDiaryIds: string[];
}

async function deleteAuthUserByEmail(email: string) {
  const list = await (await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: SVC })).json();
  const existing = (list?.users ?? []).find((u: { email?: string }) => u.email === email);
  if (existing) await fetch(`${SB}/auth/v1/admin/users/${existing.id}`, { method: "DELETE", headers: SVC });
}

/**
 * Create a throwaway client from the template's clinical values. Options:
 *  - withPortalUser: create + link a portal auth user (client becomes portal-capable).
 *  - withPlan: coach-generate + approve a real plan (needs the snapshot; always copied).
 *  - fullName: override the display name (e.g. "T2 Erasure Test").
 */
export async function provisionThrowaway(opts: { withPortalUser?: boolean; withPlan?: boolean; fullName?: string } = {}): Promise<Throwaway> {
  const stamp = `${Date.now()}-${Math.floor(performance.now())}`;
  const email = `t2-throwaway-${stamp}@example.test`;
  const password = "T2Throwaway!23";
  const fullName = opts.fullName ?? "T2 Throwaway";

  const tmplClient = (await (await fetch(`${SB}/rest/v1/client?id=eq.${TEMPLATE_CLIENT_ID}&select=partner_id,sex`, { headers: SVC })).json())[0];
  const partnerId = tmplClient.partner_id as string;

  let authUid: string | null = null;
  if (opts.withPortalUser) {
    await deleteAuthUserByEmail(email);
    const created = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: SVC, body: JSON.stringify({ email, password, email_confirm: true }) })).json();
    authUid = created?.id ?? null;
  }

  const clientRow = (await (
    await fetch(`${SB}/rest/v1/client`, { method: "POST", headers: { ...SVC, Prefer: "return=representation" }, body: JSON.stringify({ partner_id: partnerId, full_name: fullName, email, sex: tmplClient.sex ?? "male", status: "active", auth_user_id: authUid }) })
  ).json())[0];
  const clientId = clientRow.id as string;

  // Copy the template snapshot's clinical values (read-only on the template).
  const tmplSnap = (await (
    await fetch(`${SB}/rest/v1/client_snapshot?client_id=eq.${TEMPLATE_CLIENT_ID}&select=weight_kg,height_cm,age_years,body_fat_pct,body_fat_method,skinfold_data,daily_steps,occupational_level,week_schedule,bmr_kcal,lean_mass_kg,fat_mass_kg&limit=1`, { headers: SVC })
  ).json())[0];
  await fetch(`${SB}/rest/v1/client_snapshot`, { method: "POST", headers: SVC, body: JSON.stringify({ ...tmplSnap, client_id: clientId, taken_at: new Date().toISOString() }) });

  let planId: string | null = null;
  if (opts.withPlan) {
    const cc = await coachCookie();
    if (cc) {
      const gen = await trpc("plan.generate", { clientId }, cc);
      planId = (gen.data?.planId as string) ?? null;
      if (planId) await trpc("plan.approve", { id: planId }, cc);
    }
  }

  const portalCookieValue = opts.withPortalUser ? await sessionCookieValue(email, password) : null;

  return { clientId, partnerId, authUid, email, password, planId, portalCookieValue, extraCheckinIds: [], extraDiaryIds: [] };
}

/** Delete every row this throwaway owns + its auth user. Safe to call twice. */
export async function teardownThrowaway(t: Throwaway) {
  // plans + their outbox rows
  const plans = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${t.clientId}&select=id`, { headers: SVC })).json();
  for (const p of plans ?? []) {
    const rows = await (await fetch(`${SB}/rest/v1/delivery_outbox?select=id&${encodeURIComponent("payload->>planId")}=eq.${p.id}`, { headers: SVC })).json();
    for (const r of rows ?? []) await fetch(`${SB}/rest/v1/delivery_outbox?id=eq.${r.id}`, { method: "DELETE", headers: SVC });
    await fetch(`${SB}/rest/v1/plan?id=eq.${p.id}`, { method: "DELETE", headers: SVC });
  }
  await fetch(`${SB}/rest/v1/check_in?client_id=eq.${t.clientId}`, { method: "DELETE", headers: SVC });
  await fetch(`${SB}/rest/v1/diary_entry?client_id=eq.${t.clientId}`, { method: "DELETE", headers: SVC });
  await fetch(`${SB}/rest/v1/client_snapshot?client_id=eq.${t.clientId}`, { method: "DELETE", headers: SVC });
  await fetch(`${SB}/rest/v1/client?id=eq.${t.clientId}`, { method: "DELETE", headers: SVC });
  if (t.authUid) await fetch(`${SB}/auth/v1/admin/users/${t.authUid}`, { method: "DELETE", headers: SVC });
}

/** Row counts for net-zero verification. `clients` counts non-deleted rows. */
export async function dbCounts(): Promise<{ clients: number; plans: number; checkins: number }> {
  const count = async (path: string) => {
    const res = await fetch(`${SB}/rest/v1/${path}`, { headers: { ...SVC, Prefer: "count=exact", Range: "0-0" } });
    return Number(res.headers.get("content-range")?.split("/")?.[1] ?? "0");
  };
  return {
    clients: await count("client?deleted_at=is.null&select=id"),
    plans: await count("plan?select=id"),
    checkins: await count("check_in?select=id"),
  };
}
