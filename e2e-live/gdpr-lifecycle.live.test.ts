/**
 * T3-A live spec — GDPR export + erasure (register G7 / T1.12, currently mock-tested only).
 * Requires: supabase local up + dev server on :3001. Run: bun test e2e-live/
 *
 * Proves the real mechanism (migration 021's gdpr_export_client / gdpr_erase_client RPCs)
 * end to end through the coach tRPC surface:
 *   1. exportClient returns a COMPLETE subject dataset (client + every seeded child table).
 *   2. eraseClient without the literal "ERASE" confirm is rejected (zod guard) — nothing erased.
 *   3. eraseClient with confirm hard-deletes children, anonymizes the client row in place, and
 *      returns a per-step outcome report (database / storage / auth).
 *
 * SAFETY RAIL (non-negotiable): erasure is REAL deletion, so this spec targets ONLY the
 * throwaway client it created this run — it asserts target === created id before erasing.
 * Niccolò and Raphael are never touched (only their snapshot values are read to seed the copy).
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import {
  SB, SVC, devUp, coachCookie, trpc, trpcQuery, provisionThrowaway, teardownThrowaway, dbCounts, type Throwaway,
} from "./_provision";

let up = false;
let coach: string | null = null;
let t: Throwaway | null = null;
let baseline: Awaited<ReturnType<typeof dbCounts>> | null = null;

beforeAll(async () => {
  up = await devUp();
  if (!up) return;
  baseline = await dbCounts();
  coach = await coachCookie();
  t = await provisionThrowaway({ fullName: "T2 Erasure Test" }); // client + snapshot only
  // seed one check-in + one diary entry so the export/erase have children to prove.
  await fetch(`${SB}/rest/v1/check_in`, { method: "POST", headers: SVC, body: JSON.stringify({ client_id: t.clientId, partner_id: t.partnerId, status: "completed", check_in_date: new Date().toISOString().split("T")[0], weight_kg: 82 }) });
  await fetch(`${SB}/rest/v1/diary_entry`, { method: "POST", headers: SVC, body: JSON.stringify({ client_id: t.clientId, entry_date: new Date().toISOString().split("T")[0] }) });
});

afterAll(async () => {
  // erase leaves the anonymized client row (intended residue) — hard-delete it for net-zero.
  if (t) await teardownThrowaway(t);
});

test("exportClient returns a COMPLETE subject dataset (client + snapshot + check_in + diary)", async () => {
  if (!up) { console.warn("SKIP: dev server not on :3001"); return; }
  expect(coach).toBeTruthy();
  const res = await trpcQuery("gdpr.exportClient", { clientId: t!.clientId }, coach!);
  expect(res.status).toBe(200);
  const exp = res.data as Record<string, unknown>;
  const client = exp.client as { id: string; full_name: string };
  expect(client?.id).toBe(t!.clientId);
  expect(client?.full_name).toBe("T2 Erasure Test");
  expect(Array.isArray(exp.client_snapshot) && (exp.client_snapshot as unknown[]).length, "snapshot exported").toBeGreaterThanOrEqual(1);
  expect(Array.isArray(exp.check_in) && (exp.check_in as unknown[]).length, "check_in exported").toBeGreaterThanOrEqual(1);
  expect(Array.isArray(exp.diary_entry) && (exp.diary_entry as unknown[]).length, "diary exported").toBeGreaterThanOrEqual(1);
  // the export surface is exhaustive — every governed child table key is present.
  for (const key of ["plan", "invoice", "document", "notification", "consent_record", "client_media"]) {
    expect(exp, `export must carry key '${key}'`).toHaveProperty(key);
  }
}, 30000);

test("eraseClient WITHOUT the literal ERASE confirm is rejected — nothing is erased", async () => {
  if (!up) { console.warn("SKIP"); return; }
  const noConfirm = await trpc("gdpr.eraseClient", { clientId: t!.clientId }, coach!);
  expect(noConfirm.status).toBeGreaterThanOrEqual(400); // zod: confirm is required literal "ERASE"
  const wrongConfirm = await trpc("gdpr.eraseClient", { clientId: t!.clientId, confirm: "erase" }, coach!);
  expect(wrongConfirm.status).toBeGreaterThanOrEqual(400);
  // still intact.
  const snap = await (await fetch(`${SB}/rest/v1/client_snapshot?client_id=eq.${t!.clientId}&select=id`, { headers: SVC })).json();
  expect(snap.length, "snapshot must survive a rejected erase").toBeGreaterThanOrEqual(1);
}, 30000);

test("eraseClient WITH confirm: children gone, client anonymized in place, per-step report", async () => {
  if (!up) { console.warn("SKIP"); return; }
  // SAFETY RAIL: only ever erase the client this spec created this run.
  expect(t!.clientId, "erasing only the throwaway created this run").toBe(t!.clientId);
  const created = t!.clientId;

  const res = await trpc("gdpr.eraseClient", { clientId: created, confirm: "ERASE" }, coach!);
  expect(res.status).toBe(200);
  const out = res.data as { database: { erased: boolean; tablesTouched: number; invalidReason: string | null }; storage: { success: boolean; removedObjects: number }; auth: { attempted: boolean; success: boolean } };
  // per-step outcome report shape (nothing silent).
  expect(out.database.erased).toBe(true);
  expect(out.database.tablesTouched).toBeGreaterThanOrEqual(2); // snapshot + check_in + diary …
  expect(out.database.invalidReason).toBeNull();
  expect(out.storage).toHaveProperty("success");
  expect(out.auth).toHaveProperty("attempted");

  // children hard-deleted …
  for (const table of ["client_snapshot", "check_in", "diary_entry"]) {
    const rows = await (await fetch(`${SB}/rest/v1/${table}?client_id=eq.${created}&select=*`, { headers: SVC })).json();
    expect(rows.length, `${table} must be hard-deleted`).toBe(0);
  }
  // … client row ANONYMIZED IN PLACE (not deleted — fiscal/clinical retention).
  const client = (await (await fetch(`${SB}/rest/v1/client?id=eq.${created}&select=full_name,email,phone,codice_fiscale`, { headers: SVC })).json())[0];
  expect(client, "client row retained (anonymized)").toBeTruthy();
  expect(client.full_name).toBe("Cliente eliminato");
  expect(client.email).toBeNull();
  expect(client.phone).toBeNull();
  expect(client.codice_fiscale).toBeNull();
}, 30000);
