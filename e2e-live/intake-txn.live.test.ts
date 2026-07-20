/**
 * T3-E live spec — transactional intake with idempotency (register G10 / T1.7).
 * Requires: supabase local up + dev server on :3001. Run: bun test e2e-live/
 *
 * Calls the REAL submitIntakeForm path (migration 020's intake_create_client_with_snapshot RPC):
 *   1. first submit → creates client + snapshot, wasReplay=false.
 *   2. SAME idempotency key → returns the ORIGINAL ids, wasReplay=true, and NO duplicate client
 *      (exactly one idempotency reservation).
 *
 * Orphan-on-failure note: the RPC is transactional by construction (client + snapshot in one
 * txn; the idempotency reservation is the dedup key) — a mid-transaction failure is not
 * injectable at the live tier without mocking the RPC, so this spec proves the observable
 * REPLAY contract; orphan-safety is the RPC's atomicity + the unit tier's job.
 *
 * Self-cleans (client + snapshot + idempotency row). Niccolò/Raphael untouched.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { SB, SVC, devUp, coachCookie, trpc, dbCounts } from "./_provision";

let up = false;
let coach: string | null = null;
let key: string | null = null;
let createdClientId: string | null = null;

const INPUT = () => ({
  idempotencyKey: key,
  client: { fullName: "T2 Intake Test", sex: "male" as const },
  snapshot: { weightKg: 80, heightCm: 180 },
});

beforeAll(async () => {
  up = await devUp();
  if (!up) return;
  coach = await coachCookie();
  key = crypto.randomUUID();
});

afterAll(async () => {
  // Order matters: intake_idempotency.client_id FK-references client, so drop the reservation
  // (and the snapshot) BEFORE the client — else the client delete is blocked and orphans.
  if (key) await fetch(`${SB}/rest/v1/intake_idempotency?key=eq.${key}`, { method: "DELETE", headers: SVC });
  if (createdClientId) {
    await fetch(`${SB}/rest/v1/client_snapshot?client_id=eq.${createdClientId}`, { method: "DELETE", headers: SVC });
    await fetch(`${SB}/rest/v1/client?id=eq.${createdClientId}`, { method: "DELETE", headers: SVC });
  }
});

test("first submit creates a client + snapshot (wasReplay=false)", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  expect(coach).toBeTruthy();
  const res = await trpc("client.submitIntakeForm", INPUT(), coach!);
  expect(res.status).toBe(200);
  expect(res.data?.clientId).toBeTruthy();
  expect(res.data?.snapshotId).toBeTruthy();
  expect(res.data?.wasReplay).toBe(false);
  createdClientId = res.data.clientId;

  // the rows really exist.
  const client = await (await fetch(`${SB}/rest/v1/client?id=eq.${createdClientId}&select=full_name`, { headers: SVC })).json();
  expect(client?.[0]?.full_name).toBe("T2 Intake Test");
}, 30000);

test("replaying the same idempotency key returns the original ids, wasReplay=true, no duplicate", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const before = await dbCounts();
  const res = await trpc("client.submitIntakeForm", INPUT(), coach!);
  expect(res.status).toBe(200);
  expect(res.data?.wasReplay, "second call with the same key is a replay").toBe(true);
  expect(res.data?.clientId, "replay returns the ORIGINAL client id").toBe(createdClientId);
  expect(res.data?.snapshotId).toBeTruthy();

  // no new client was created.
  const after = await dbCounts();
  expect(after.clients, "replay must not create a duplicate client").toBe(before.clients);
  // exactly one idempotency reservation for this key.
  const reservations = await (await fetch(`${SB}/rest/v1/intake_idempotency?key=eq.${key}&select=client_id`, { headers: SVC })).json();
  expect(reservations.length).toBe(1);
  expect(reservations[0].client_id).toBe(createdClientId);
}, 30000);
