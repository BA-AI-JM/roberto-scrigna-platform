/**
 * T2-G live spec — approve → transactional outbox + one-active invariant (T1.6a, G8+G12).
 * Requires: supabase local up + dev server on :3001. Run: bun test e2e-live/
 *
 * Drives the REAL coach flow over tRPC (password login → cookie): generate a draft plan,
 * approve it, and assert via the service key that approval is atomic and honest:
 *   1. approve writes exactly ONE delivery_outbox row (event 'plan/delivered') and activates.
 *   2. approving a SECOND plan archives the prior active one (one-active invariant).
 *   3. re-approving an already-active plan is a CONFLICT (409), not a silent double-send.
 *
 * Self-provisioning: generates its own plans for the seed client (Niccolò — the one seed
 * client with a snapshot the engine can generate from) and cleans up every plan + outbox row.
 * The DB was reseeded mid-arc (no pre-existing plans), so this spec depends on NOTHING but the
 * base seed + a snapshot.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";

const SB = "http://127.0.0.1:54321";
const APP = "http://localhost:3001";
const SK = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const SVC = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const CLIENT_ID = "9dacdf1b-a9b2-4881-8049-f241ebea53ec"; // Niccolò Ambrosi (has a snapshot)
const COACH = { email: "roberto@test.com", password: "testpass123" };
const b64url = (s: string) => Buffer.from(s).toString("base64url");

let up = false;
let cookie: string | null = null;
const createdPlanIds: string[] = [];

async function coachCookie(): Promise<string | null> {
  const tok = await (
    await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SK, "Content-Type": "application/json" },
      body: JSON.stringify(COACH),
    })
  ).json();
  if (!tok?.access_token) return null;
  const user = await (await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: `Bearer ${tok.access_token}` } })).json();
  const session = { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user };
  return `sb-127-auth-token=base64-${b64url(JSON.stringify(session))}`;
}

async function trpc(path: string, input: unknown) {
  const res = await fetch(`${APP}/api/trpc/${path}`, {
    method: "POST",
    headers: { Cookie: cookie!, "Content-Type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, data: body?.result?.data?.json, error: body?.error?.json ?? body?.error };
}

async function outboxRowsFor(planId: string): Promise<Array<{ id: string; event_name: string }>> {
  const url = `${SB}/rest/v1/delivery_outbox?select=id,event_name&${encodeURIComponent("payload->>planId")}=eq.${planId}`;
  return (await fetch(url, { headers: SVC })).json();
}

async function planStatus(planId: string): Promise<string | null> {
  const rows = await (await fetch(`${SB}/rest/v1/plan?id=eq.${planId}&select=status`, { headers: SVC })).json();
  return rows?.[0]?.status ?? null;
}

async function purgeClientPlans() {
  const plans = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${CLIENT_ID}&select=id`, { headers: SVC })).json();
  for (const p of plans ?? []) {
    const rows = await outboxRowsFor(p.id);
    for (const r of rows) await fetch(`${SB}/rest/v1/delivery_outbox?id=eq.${r.id}`, { method: "DELETE", headers: SVC });
    await fetch(`${SB}/rest/v1/plan?id=eq.${p.id}`, { method: "DELETE", headers: SVC });
  }
}

async function generatePlan(): Promise<string> {
  const r = await trpc("plan.generate", { clientId: CLIENT_ID });
  const id = r.data?.planId as string | undefined;
  if (!id) throw new Error(`generate failed: ${r.status} ${JSON.stringify(r.error)?.slice(0, 120)}`);
  createdPlanIds.push(id);
  return id;
}

beforeAll(async () => {
  up = await fetch(`${APP}/login`).then((r) => r.ok).catch(() => false);
  if (!up) return;
  cookie = await coachCookie();
  await purgeClientPlans(); // start from a known-clean slate (no active plan)
});

afterAll(async () => {
  if (up) await purgeClientPlans();
});

test("approve writes exactly one delivery_outbox row and activates the plan", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  expect(cookie).toBeTruthy();
  const planA = await generatePlan();
  expect(await planStatus(planA)).toBe("draft");

  const res = await trpc("plan.approve", { id: planA });
  expect(res.status).toBe(200);
  expect(res.data?.success).toBe(true);

  const outbox = await outboxRowsFor(planA);
  expect(outbox.length, "exactly one outbox row per approval (transactional, no dup)").toBe(1);
  expect(outbox[0]!.event_name).toBe("plan/delivered");
  expect(await planStatus(planA)).toBe("active");
}, 45000);

test("approving a second plan archives the prior active one (one-active invariant)", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const plans = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${CLIENT_ID}&status=eq.active&select=id`, { headers: SVC })).json();
  const priorActive = plans?.[0]?.id as string | undefined; // planA from the previous test
  expect(priorActive, "a prior active plan should exist from test 1").toBeTruthy();

  const planB = await generatePlan();
  const res = await trpc("plan.approve", { id: planB });
  expect(res.status).toBe(200);
  expect(res.data?.priorArchived, "the prior active plan must be archived in the same txn").toBeGreaterThanOrEqual(1);

  expect(await planStatus(planB)).toBe("active");
  expect(await planStatus(priorActive!)).not.toBe("active"); // archived/superseded
  // Exactly one active plan for the client now.
  const actives = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${CLIENT_ID}&status=eq.active&select=id`, { headers: SVC })).json();
  expect(actives.length).toBe(1);
}, 45000);

test("re-approving an already-active plan is a CONFLICT, not a silent double-send", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const actives = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${CLIENT_ID}&status=eq.active&select=id`, { headers: SVC })).json();
  const activeId = actives?.[0]?.id as string;
  const before = (await outboxRowsFor(activeId)).length;

  const res = await trpc("plan.approve", { id: activeId });
  expect(res.status).toBe(409); // tRPC CONFLICT → HTTP 409
  expect((res.error?.message ?? "").toLowerCase()).toContain("già attiv");

  // No second outbox row was written for the rejected re-approval.
  expect((await outboxRowsFor(activeId)).length).toBe(before);
}, 45000);
