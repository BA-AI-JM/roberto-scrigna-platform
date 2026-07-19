/**
 * T1.0/T1.1 live spec — G1: the public check-in journey against the REAL stack.
 * Requires: supabase local up + dev server on :3001. Run: bun test e2e-live/
 * (Deliberately outside vitest's src/** include — this is the live tier, not the 1.7s unit tier.)
 *
 * STATUS AT AUTHORING (2026-07-19): RED by design. A valid pending token exists in the DB,
 * yet the anon caller gets {valid:false} because publicProcedure's anon client is blocked by
 * partner-scoped RLS (register G1, runtime-proven). This spec turns GREEN when T1.1 ships the
 * SECURITY DEFINER / service-role token-consumption path. Do not "fix" the test — fix the app.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";

const SB = "http://127.0.0.1:54321";
const APP = "http://localhost:3001";
const SK = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"; // supabase-local well-known dev key
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };

let up = false;
let checkinId: string | null = null;
let token: string | null = null;

beforeAll(async () => {
  up = await fetch(`${APP}/login`).then((r) => r.ok).catch(() => false);
  if (!up) return;
  const partner = await (await fetch(`${SB}/rest/v1/partner?select=id&limit=1`, { headers: H })).json();
  const client = await (await fetch(`${SB}/rest/v1/client?select=id&limit=1`, { headers: H })).json();
  const rows = await (
    await fetch(`${SB}/rest/v1/check_in`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({
        client_id: client[0].id,
        partner_id: partner[0].id,
        status: "pending",
        due_date: "2026-07-26",
      }),
    })
  ).json();
  checkinId = rows[0]?.id ?? null;
  token = rows[0]?.token ?? null;
});

afterAll(async () => {
  if (checkinId) await fetch(`${SB}/rest/v1/check_in?id=eq.${checkinId}`, { method: "DELETE", headers: H });
});

test("G1: anonymous client can validate a real pending check-in token", async () => {
  if (!up) { console.warn("SKIP: dev server not running on :3001"); return; }
  expect(token).toBeTruthy();
  const input = encodeURIComponent(JSON.stringify({ json: { token } }));
  const res = await fetch(`${APP}/api/trpc/checkin.validateToken?input=${input}`);
  const body = await res.json();
  const payload = body?.result?.data?.json;
  // The product contract: a valid pending token MUST validate for the anonymous email-link visitor.
  expect(res.status).toBe(200);
  expect(payload?.valid).toBe(true); // RED until T1.1 — G1 runtime-proven 2026-07-19
});

test("G1 guard: a random token is rejected (no accidental open door after the fix)", async () => {
  if (!up) return;
  const input = encodeURIComponent(JSON.stringify({ json: { token: crypto.randomUUID() } }));
  const res = await fetch(`${APP}/api/trpc/checkin.validateToken?input=${input}`);
  const payload = (await res.json())?.result?.data?.json;
  expect(payload?.valid).toBe(false);
});
