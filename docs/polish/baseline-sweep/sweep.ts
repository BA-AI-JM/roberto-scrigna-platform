/**
 * P0 baseline screenshot sweep — coach + portal, desktop (1440) + mobile (390).
 * Run: bun run docs/polish/baseline-sweep/sweep.ts   (dev server on :3001, supabase local up)
 * Output: docs/polish/baseline-sweep/{desktop,mobile}/*.png + manifest.json
 * Best-effort: every capture is try/caught; failures land in the manifest, never abort the sweep.
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3001";
const SB = "http://127.0.0.1:54321";
const MAIL = "http://127.0.0.1:54324";
// Supabase-local well-known dev service key (already committed in scripts/seed-local.sh)
const SK = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const COACH = { email: "roberto@test.com", pass: "testpass123" };
const PORTAL_EMAIL = "n.ambrosi88@gmail.com"; // seeded client Niccolò

type Entry = { route: string; viewport: string; file?: string; status: string; ms: number };
const manifest: Entry[] = [];
const gaps: string[] = [];

const slug = (r: string) => r.replace(/^\//, "").replace(/[/[\]?=&]+/g, "-").replace(/-+$/, "") || "root";

async function rest(path: string): Promise<any> {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } });
  return res.json();
}

async function capture(page: Page, route: string, viewport: string, name?: string) {
  const t0 = Date.now();
  const file = join(ROOT, viewport, `${name ?? slug(route)}.png`);
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 20000 }).catch(async () => {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: file, fullPage: true });
    manifest.push({ route, viewport, file: file.replace(ROOT + "/", ""), status: "ok", ms: Date.now() - t0 });
  } catch (e: any) {
    manifest.push({ route, viewport, status: `FAIL: ${String(e?.message ?? e).slice(0, 120)}`, ms: Date.now() - t0 });
  }
}

async function coachLogin(page: Page): Promise<boolean> {
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000); // let React hydrate — pre-hydration fills never reach state
    const email = page.getByLabel("Email");
    const pass = page.getByLabel("Password");
    await email.fill(COACH.email);
    await pass.fill(COACH.pass);
    const btn = page.getByRole("button", { name: "Accedi" });
    if (await btn.isDisabled()) { // state didn't take — retype with real keystrokes
      await email.clear(); await email.pressSequentially(COACH.email, { delay: 20 });
      await pass.clear(); await pass.pressSequentially(COACH.pass, { delay: 20 });
    }
    await btn.click({ timeout: 10000 });
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    return true;
  } catch (e) {
    gaps.push(`COACH-AUTH-GAP: ${String(e).slice(0, 200)}`);
    return false;
  }
}

/** Portal magic-link: initiate from app (sets PKCE verifier cookie), harvest link from local mail, exchange code on :3001. */
async function portalLogin(page: Page): Promise<boolean> {
  try {
    const since = Date.now();
    await page.goto(`${BASE}/portal/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000); // hydration — same race as coach login
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(PORTAL_EMAIL);
    const btn = page.getByRole("button").filter({ hasText: /invia|accedi|link|entra|login/i }).first();
    if ((await btn.count()) && (await btn.isDisabled())) {
      await emailInput.clear();
      await emailInput.pressSequentially(PORTAL_EMAIL, { delay: 20 });
    }
    (await btn.count()) ? await btn.click({ timeout: 10000 }) : await page.keyboard.press("Enter");
    // harvest from Mailpit (fallback Inbucket)
    let link: string | null = null;
    for (let i = 0; i < 20 && !link; i++) {
      await page.waitForTimeout(1000);
      try {
        const list = await (await fetch(`${MAIL}/api/v1/messages?limit=10`)).json();
        const msg = (list.messages ?? []).find((m: any) =>
          JSON.stringify(m.To ?? m.to ?? "").toLowerCase().includes(PORTAL_EMAIL) &&
          new Date(m.Created ?? m.created ?? 0).getTime() > since - 60000);
        if (msg) {
          const body = await (await fetch(`${MAIL}/api/v1/message/${msg.ID ?? msg.id}`)).json();
          const text = `${body.Text ?? ""} ${body.HTML ?? ""}`;
          link = text.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^"'\s<>\]]+/)?.[0]?.replace(/&amp;/g, "&") ?? null;
        }
      } catch { /* mail API variant */ }
      if (!link) {
        try {
          const mb = await (await fetch(`${MAIL}/api/v1/mailbox/${PORTAL_EMAIL.split("@")[0]}`)).json();
          if (Array.isArray(mb) && mb.length) {
            const body = await (await fetch(`${MAIL}/api/v1/mailbox/${PORTAL_EMAIL.split("@")[0]}/${mb[0].id}`)).json();
            link = JSON.stringify(body).match(/http:\\?\/\\?\/127\.0\.0\.1:54321\\?\/auth\\?\/v1\\?\/verify[^"'\s<>\]]+/)?.[0]?.replace(/\\\//g, "/").replace(/&amp;/g, "&") ?? null;
          }
        } catch { /* not inbucket either */ }
      }
    }
    if (!link) { gaps.push("PORTAL-AUTH-GAP: no magic-link email captured (mail API)"); return false; }
    const verify = await fetch(link, { redirect: "manual" });
    const loc = verify.headers.get("location") ?? "";
    const code = new URL(loc, BASE).searchParams.get("code");
    if (!code) { gaps.push(`PORTAL-AUTH-GAP: verify redirect had no code (${loc.slice(0, 100)})`); return false; }
    await page.goto(`${BASE}/portal/auth/callback?code=${code}`, { waitUntil: "domcontentloaded", timeout: 15000 });
    if (!page.url().includes("/portal/dashboard")) { gaps.push(`PORTAL-AUTH-GAP: callback landed on ${page.url()}`); return false; }
    return true;
  } catch (e) {
    gaps.push(`PORTAL-AUTH-GAP: ${String(e).slice(0, 150)}`);
    return false;
  }
}

async function sweepViewport(ctx: BrowserContext, viewport: string, coachState: boolean, portalState: boolean) {
  const page = await ctx.newPage();
  for (const r of ["/login", "/register", "/portal/login"]) await capture(page, r, viewport);
  if (coachState) {
    const coachPages = ["/dashboard", "/clients", "/plans", "/plans/generate", "/invoices", "/invoices/new",
      "/monitoring", "/monitoring/checkin", "/monitoring/training", "/monitoring/notifications", "/settings"];
    const clients = await rest("client?select=id&limit=1");
    if (clients?.[0]?.id) coachPages.splice(2, 0, `/clients/${clients[0].id}`);
    const invoices = await rest("invoice?select=id&limit=1");
    if (invoices?.[0]?.id) coachPages.push(`/invoices/${invoices[0].id}`);
    for (const r of coachPages) await capture(page, r, viewport);
    // intake wizard click-through (best-effort)
    await capture(page, "/plans/new", viewport, "intake-p1");
    for (let step = 2; step <= 7; step++) {
      try {
        const next = page.getByRole("button").filter({ hasText: /avanti|continua|prosegui|next/i }).first();
        if (!(await next.count())) break;
        await next.click({ timeout: 4000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(ROOT, viewport, `intake-p${step}.png`), fullPage: true });
        manifest.push({ route: `/plans/new (step ${step})`, viewport, file: `${viewport}/intake-p${step}.png`, status: "ok", ms: 0 });
      } catch { gaps.push(`INTAKE-STEP-GAP: stopped at step ${step} (${viewport}) — likely validation gate`); break; }
    }
  }
  if (portalState) {
    for (const r of ["/portal/dashboard", "/portal/plan", "/portal/diary", "/portal/progress",
      "/portal/training", "/portal/feedback", "/portal/firma", "/portal/notifications"]) await capture(page, r, viewport);
  }
  await page.close();
}

const browser = await chromium.launch();
for (const vp of ["desktop", "mobile"]) mkdirSync(join(ROOT, vp), { recursive: true });

// Auth once on desktop, persist storageState, reuse for mobile.
const authCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const authPage = await authCtx.newPage();
const coachOk = await coachLogin(authPage);
const coachState = coachOk ? await authCtx.storageState() : undefined;
await authPage.close(); await authCtx.close();

const portalCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const portalPage = await portalCtx.newPage();
const portalOk = await portalLogin(portalPage);
const portalState = portalOk ? await portalCtx.storageState() : undefined;
await portalPage.close(); await portalCtx.close();

for (const [name, vpSize] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
  // coach pages under coach session
  if (coachState) {
    const ctx = await browser.newContext({ viewport: vpSize, storageState: coachState, deviceScaleFactor: 2 });
    await sweepViewport(ctx, name, true, false);
    await ctx.close();
  }
  // portal + public under portal session (public pages captured here too)
  const ctx2 = await browser.newContext({ viewport: vpSize, storageState: portalState, deviceScaleFactor: 2 });
  await sweepViewport(ctx2, name, false, !!portalState);
  await ctx2.close();
}

await browser.close();
gaps.push("DATA-GAP: plan=0 in DB — plan review tabs, portal plan view, PDF captured EMPTY or not at all; populated capture deferred to P2 journey drive");
writeFileSync(join(ROOT, "manifest.json"), JSON.stringify({ generated: new Date().toISOString(), coachOk, portalOk, entries: manifest, gaps }, null, 2));
const ok = manifest.filter(e => e.status === "ok").length;
console.log(`SWEEP DONE: ${ok}/${manifest.length} captures ok | coachAuth=${coachOk} portalAuth=${portalOk} | gaps=${gaps.length}`);
gaps.forEach(g => console.log("GAP: " + g));
