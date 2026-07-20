/**
 * Approve → transactional outbox + one-active invariant (T1.6a, G8+G12). Live tier.
 * Requires: supabase local up + dev server on :3001. Run: bun test e2e-live/
 *
 * Drives the REAL coach flow over tRPC on a THROWAWAY client (lane-3: Niccolò/Raphael are
 * READ-ONLY — the throwaway's snapshot is copied from Niccolò, nothing of his is written):
 *   1. approve writes exactly ONE delivery_outbox row (event 'plan/delivered') + activates.
 *   2. approving a second plan archives the prior active one (one-active invariant).
 *   3. re-approving an already-active plan is a CONFLICT (409), not a silent double-send.
 *
 * Self-provisions + tears down every plan / outbox row / the throwaway itself (net-zero).
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { SB, SVC, devUp, coachCookie, trpc, provisionThrowaway, teardownThrowaway, type Throwaway } from "./_provision";

let up = false;
let coach: string | null = null;
let t: Throwaway | null = null;
const createdPlanIds: string[] = [];

async function outboxRowsFor(planId: string): Promise<Array<{ id: string; event_name: string }>> {
  const url = `${SB}/rest/v1/delivery_outbox?select=id,event_name&${encodeURIComponent("payload->>planId")}=eq.${planId}`;
  return (await fetch(url, { headers: SVC })).json();
}
async function planStatus(planId: string): Promise<string | null> {
  const rows = await (await fetch(`${SB}/rest/v1/plan?id=eq.${planId}&select=status`, { headers: SVC })).json();
  return rows?.[0]?.status ?? null;
}
async function generatePlan(): Promise<string> {
  const r = await trpc("plan.generate", { clientId: t!.clientId }, coach!);
  const id = r.data?.planId as string | undefined;
  if (!id) throw new Error(`generate failed: ${r.status} ${JSON.stringify(r.error)?.slice(0, 120)}`);
  createdPlanIds.push(id);
  return id;
}

beforeAll(async () => {
  up = await devUp();
  if (!up) return;
  coach = await coachCookie();
  t = await provisionThrowaway({ fullName: "T2 Approve Test" }); // client + snapshot, no plan
});

afterAll(async () => {
  if (t) await teardownThrowaway(t); // deletes every plan + its outbox rows + the client
});

test("approve writes exactly one delivery_outbox row and activates the plan", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  expect(coach).toBeTruthy();
  const planA = await generatePlan();
  expect(await planStatus(planA)).toBe("draft");

  const res = await trpc("plan.approve", { id: planA }, coach!);
  expect(res.status).toBe(200);
  expect(res.data?.success).toBe(true);

  const outbox = await outboxRowsFor(planA);
  expect(outbox.length, "exactly one outbox row per approval (transactional, no dup)").toBe(1);
  expect(outbox[0]!.event_name).toBe("plan/delivered");
  expect(await planStatus(planA)).toBe("active");
}, 45000);

test("approving a second plan archives the prior active one (one-active invariant)", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const plans = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${t!.clientId}&status=eq.active&select=id`, { headers: SVC })).json();
  const priorActive = plans?.[0]?.id as string | undefined;
  expect(priorActive, "a prior active plan should exist from test 1").toBeTruthy();

  const planB = await generatePlan();
  const res = await trpc("plan.approve", { id: planB }, coach!);
  expect(res.status).toBe(200);
  expect(res.data?.priorArchived, "the prior active plan must be archived in the same txn").toBeGreaterThanOrEqual(1);

  expect(await planStatus(planB)).toBe("active");
  expect(await planStatus(priorActive!)).not.toBe("active");
  const actives = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${t!.clientId}&status=eq.active&select=id`, { headers: SVC })).json();
  expect(actives.length).toBe(1);
}, 45000);

test("re-approving an already-active plan is a CONFLICT, not a silent double-send", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const actives = await (await fetch(`${SB}/rest/v1/plan?client_id=eq.${t!.clientId}&status=eq.active&select=id`, { headers: SVC })).json();
  const activeId = actives?.[0]?.id as string;
  const before = (await outboxRowsFor(activeId)).length;

  const res = await trpc("plan.approve", { id: activeId }, coach!);
  expect(res.status).toBe(409);
  expect((res.error?.message ?? "").toLowerCase()).toContain("già attiv");
  expect((await outboxRowsFor(activeId)).length).toBe(before);
}, 45000);
