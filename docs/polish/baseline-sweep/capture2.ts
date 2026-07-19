/** Populated-state capture: review tabs (by text), PDF artifact, portal with ACTIVE plan. */
import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "journey");
const BASE = "http://localhost:3001";
const MAIL = "http://127.0.0.1:54324";
const PLAN_ID = "bafce20c-9a67-4fe7-8c95-22f6c40f9f84";
const TABS = ["Panoramica", "Macro", "Pasti", "Integratori", "Monitoraggio", "Versioni"];
const log: string[] = [];
const note = (m: string) => { log.push(m); console.log(m); };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByLabel("Email").fill("roberto@test.com");
  await page.getByLabel("Password").fill("testpass123");
  const b = page.getByRole("button", { name: "Accedi" });
  if (await b.isDisabled()) { await page.getByLabel("Email").pressSequentially("roberto@test.com", { delay: 15 }); await page.getByLabel("Password").pressSequentially("testpass123", { delay: 15 }); }
  await b.click(); await page.waitForURL("**/dashboard", { timeout: 15000 });
  note("login OK");

  // portal populated (plan now ACTIVE)
  const since = Date.now();
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/portal/login`, { waitUntil: "networkidle" }); await p2.waitForTimeout(1000);
  const em = p2.locator('input[type="email"]').first(); await em.fill("n.ambrosi88@gmail.com");
  const pb = p2.getByRole("button").filter({ hasText: /invia|accedi|link|entra|login/i }).first();
  if ((await pb.count()) && (await pb.isDisabled())) await em.pressSequentially("n.ambrosi88@gmail.com", { delay: 15 });
  (await pb.count()) ? await pb.click() : await p2.keyboard.press("Enter");
  let link: string | null = null;
  for (let i = 0; i < 20 && !link; i++) {
    await p2.waitForTimeout(1000);
    try {
      const list = await (await fetch(`${MAIL}/api/v1/messages?limit=10`)).json();
      const msg = (list.messages ?? []).find((m: any) => JSON.stringify(m.To ?? "").toLowerCase().includes("n.ambrosi88") && new Date(m.Created ?? 0).getTime() > since - 30000);
      if (msg) { const body = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json(); link = `${body.Text ?? ""} ${body.HTML ?? ""}`.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^"'\s<>\]]+/)?.[0]?.replace(/&amp;/g, "&") ?? null; }
    } catch {}
  }
  if (!link) throw new Error("no magic link");
  const verify = await fetch(link, { redirect: "manual" });
  const code = new URL(verify.headers.get("location") ?? "", BASE).searchParams.get("code");
  await p2.goto(`${BASE}/portal/auth/callback?code=${code}`, { waitUntil: "domcontentloaded" });
  note(`portal auth → ${p2.url()}`);
  const state = await ctx.storageState();
  for (const [vp, size] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]] as const) {
    const c = await browser.newContext({ viewport: size, deviceScaleFactor: 2, storageState: state });
    const p = await c.newPage();
    for (const r of ["/portal/dashboard", "/portal/plan", "/portal/progress"]) {
      await p.goto(`${BASE}${r}`, { waitUntil: "networkidle" }).catch(() => {});
      await p.waitForTimeout(700);
      await p.screenshot({ path: join(OUT, `active-${vp}${r.replace(/\//g, "-")}.png`), fullPage: true });
      note(`shot: active-${vp} ${r}`);
    }
    await c.close();
  }
} catch (e) { note(`ERROR: ${String(e).slice(0, 250)}`); }
finally { writeFileSync(join(OUT, "capture2-log.json"), JSON.stringify(log, null, 2)); await browser.close(); console.log("CAPTURE2 DONE"); }
