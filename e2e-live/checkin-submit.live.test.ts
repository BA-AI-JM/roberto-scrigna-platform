/**
 * T3-B live spec — the full public check-in loop (T1.1a RPCs; the tier had validate-only).
 * Requires: supabase local up + dev server on :3001. Run: bun test e2e-live/
 *
 * Exercises migration 017's consume path end to end, anonymously (email-link visitor):
 *   1. validateToken(valid) → valid.
 *   2. submitCheckin(full payload) → row completed + deviation math ran (prev weight arrives
 *      via the SECURITY DEFINER RPC — snapshot 91.5 → submit 82 → −9.5, flagged).
 *   3. replay the same token → CONFLICT (the consume WHERE is the replay/race guard).
 *   4. expired token → validate invalid('expired') + submit rejected ('scaduto').
 *
 * Self-provisions a THROWAWAY client (+ snapshot for the deviation baseline); Niccolò/Raphael
 * are never touched. Net-zero teardown.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { SB, SVC, devUp, trpc, trpcQuery, provisionThrowaway, teardownThrowaway, type Throwaway } from "./_provision";

let up = false;
let t: Throwaway | null = null;
let validToken: string | null = null;
let expiredToken: string | null = null;

const PAYLOAD = (token: string) => ({
  token,
  weightKg: 82,
  energyLevel: 7,
  sleepQuality: 7,
  stressLevel: 4,
  hungerLevel: 5,
  digestiveHealth: 7,
  adherencePct: 90,
  trainingAdherence: 80,
});

async function seedPending(token: string, expiresAt: string): Promise<void> {
  await fetch(`${SB}/rest/v1/check_in`, {
    method: "POST",
    headers: SVC,
    body: JSON.stringify({ client_id: t!.clientId, partner_id: t!.partnerId, status: "pending", check_in_date: null, token, token_expires_at: expiresAt }),
  });
}

beforeAll(async () => {
  up = await devUp();
  if (!up) return;
  t = await provisionThrowaway({ fullName: "T2 Checkin Test" }); // client + snapshot (91.5) baseline
  validToken = crypto.randomUUID();
  expiredToken = crypto.randomUUID();
  await seedPending(validToken, new Date(Date.now() + 7 * 86400000).toISOString()); // +7d
  await seedPending(expiredToken, new Date(Date.now() - 86400000).toISOString()); // yesterday
});

afterAll(async () => {
  if (t) await teardownThrowaway(t);
});

test("validateToken (anon) accepts a valid pending token", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  const res = await trpcQuery("checkin.validateToken", { token: validToken }, ""); // anon
  expect(res.status).toBe(200);
  expect(res.data?.valid).toBe(true);
  expect(res.data?.checkin?.id).toBeTruthy();
});

test("submitCheckin (anon) completes the row and runs the deviation math", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const res = await trpc("checkin.submitCheckin", PAYLOAD(validToken!), ""); // anon
  expect(res.status).toBe(200);

  const row = (await (await fetch(`${SB}/rest/v1/check_in?token=eq.${validToken}&select=status,weight_kg,weight_deviation_kg,weight_flagged`, { headers: SVC })).json())[0];
  expect(row.status).toBe("completed");
  expect(Number(row.weight_kg)).toBe(82);
  // prev weight 91.5 (snapshot) → 82 − 91.5 = −9.5; deviation math ran (not silently nulled).
  expect(Math.abs(Number(row.weight_deviation_kg) - -9.5), `deviation=${row.weight_deviation_kg}`).toBeLessThan(0.1);
  expect(row.weight_flagged).toBe(true);
});

test("replaying the same token is rejected — no double submit (replay guard live-proven)", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const res = await trpc("checkin.submitCheckin", PAYLOAD(validToken!), "");
  // Sequential replay is caught at the VALIDATE leg (row now 'completed' → NOT_FOUND/404,
  // 'già completato'); the CONFLICT/409 consume-leg guard is the race backstop. Either way
  // the token cannot be submitted twice.
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect([404, 409]).toContain(res.status);
  expect((res.error?.message ?? "").toLowerCase()).toMatch(/già (inviat|complet)|scadut|non trovato/);
  // completed exactly once — the replay did not re-process the row.
  const row = (await (await fetch(`${SB}/rest/v1/check_in?token=eq.${validToken}&select=status,weight_kg`, { headers: SVC })).json())[0];
  expect(row.status).toBe("completed");
  expect(Number(row.weight_kg)).toBe(82);
});

test("an expired token: validate → invalid, submit → rejected ('scaduto')", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const val = await trpcQuery("checkin.validateToken", { token: expiredToken }, "");
  expect(val.status).toBe(200);
  expect(val.data?.valid).toBe(false);

  const sub = await trpc("checkin.submitCheckin", PAYLOAD(expiredToken!), "");
  expect(sub.status).toBeGreaterThanOrEqual(400); // NOT_FOUND with the 'scaduto' message
  expect((sub.error?.message ?? "").toLowerCase()).toMatch(/scadut/);

  // the expired row was never consumed — still pending.
  const row = (await (await fetch(`${SB}/rest/v1/check_in?token=eq.${expiredToken}&select=status`, { headers: SVC })).json())[0];
  expect(row.status).toBe("pending");
});
