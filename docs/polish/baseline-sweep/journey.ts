/**
 * P2 journey drive — the core coach loop, live: select client → wizard cards →
 * generate → review tabs → approve → portal (populated) → PDF artifact.
 * Run: bun run docs/polish/baseline-sweep/journey.ts  (dev on :3001, supabase up, snapshot seeded)
 * Output: docs/polish/baseline-sweep/journey/*.png + journey-manifest.json + plan.pdf
 */
import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "journey");
const BASE = "http://localhost:3001";
const MAIL = "http://127.0.0.1:54324";
const COACH = { email: "roberto@test.com", pass: "testpass123" };
const PORTAL_EMAIL = "n.ambrosi88@gmail.com";
const log: string[] = [];
const note = (m: string) => { log.push(m); console.log(m); };

async function shot(page: Page, name: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  note(`shot: ${name} @ ${page.url()}`);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

try {
  // login (hydration-guarded)
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByLabel("Email").fill(COACH.email);
  await page.getByLabel("Password").fill(COACH.pass);
  const loginBtn = page.getByRole("button", { name: "Accedi" });
  if (await loginBtn.isDisabled()) {
    await page.getByLabel("Email").pressSequentially(COACH.email, { delay: 15 });
    await page.getByLabel("Password").pressSequentially(COACH.pass, { delay: 15 });
  }
  await loginBtn.click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  note("login OK");

  // generate wizard — select client, let estimateForClient populate the cards
  await page.goto(`${BASE}/plans/generate`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const select = page.locator("select").first();
  const opts = await select.locator("option").allTextContents();
  const idx = opts.findIndex(o => /Niccol/i.test(o));
  note(`client options: ${JSON.stringify(opts)} → selecting index ${idx}`);
  if (idx < 0) throw new Error("Niccolò not in client options");
  await select.selectOption({ index: idx });
  await page.waitForTimeout(2500); // estimateForClient + card render
  await shot(page, "01-wizard-populated");

  // generation-wait experience (the "magic moment" evidence)
  const genBtn = page.getByRole("button", { name: /Genera Piano/i });
  await genBtn.scrollIntoViewIfNeeded();
  if (await genBtn.isDisabled()) { note("GENERA DISABLED — capturing state and stopping journey"); await shot(page, "01b-genera-disabled"); throw new Error("genera disabled"); }
  await genBtn.click();
  note("genera clicked — capturing wait state");
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "02-generation-wait.png"), fullPage: false });
  await page.waitForURL("**/plans/**", { timeout: 60000 });
  await page.waitForLoadState("networkidle");
  await shot(page, "03-post-generate-landing");
  const planUrl = page.url();
  const planId = planUrl.match(/plans\/([0-9a-f-]{36})/)?.[1] ?? null;
  note(`plan URL: ${planUrl} (id=${planId})`);

  // review page tabs
  if (!/review/.test(planUrl) && planId) await page.goto(`${BASE}/plans/${planId}/review`, { waitUntil: "networkidle" }).catch(() => {});
  await shot(page, "04-review-tab-default");
  const tabs = page.getByRole("tab");
  const tabCount = await tabs.count();
  note(`review tabs found: ${tabCount}`);
  for (let i = 0; i < Math.min(tabCount, 7); i++) {
    const t = tabs.nth(i);
    const label = (await t.textContent())?.trim().replace(/\s+/g, "-").slice(0, 20) ?? `tab${i}`;
    await t.click().catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `05-review-${i}-${label}.png`), fullPage: true });
    note(`shot: review tab ${i} (${label})`);
  }

  // approve (makes plan active for portal; inngest failure is swallowed by design — fine locally)
  const approve = page.getByRole("button", { name: /Approva/i }).first();
  if (await approve.count()) {
    await approve.click().catch(() => {});
    await page.waitForTimeout(1200);
    // possible confirm dialog
    const confirm = page.getByRole("button", { name: /Conferma|Approva/i }).last();
    if (await confirm.count()) await confirm.click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, "06-post-approve");
    note("approve attempted");
  } else note("no Approva button found");

  // PDF artifact via coach session
  if (planId) {
    const resp = await ctx.request.get(`${BASE}/api/pdf/${planId}`);
    note(`pdf status: ${resp.status()} content-type: ${resp.headers()["content-type"]}`);
    if (resp.ok()) writeFileSync(join(OUT, "plan.pdf"), Buffer.from(await resp.body()));
  }

  // portal, populated (magic-link)
  const since = Date.now();
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/portal/login`, { waitUntil: "networkidle" });
  await p2.waitForTimeout(1000);
  const em = p2.locator('input[type="email"]').first();
  await em.fill(PORTAL_EMAIL);
  const pbtn = p2.getByRole("button").filter({ hasText: /invia|accedi|link|entra|login/i }).first();
  if ((await pbtn.count()) && (await pbtn.isDisabled())) await em.pressSequentially(PORTAL_EMAIL, { delay: 15 });
  (await pbtn.count()) ? await pbtn.click() : await p2.keyboard.press("Enter");
  let link: string | null = null;
  for (let i = 0; i < 20 && !link; i++) {
    await p2.waitForTimeout(1000);
    try {
      const list = await (await fetch(`${MAIL}/api/v1/messages?limit=10`)).json();
      const msg = (list.messages ?? []).find((m: any) => JSON.stringify(m.To ?? "").toLowerCase().includes(PORTAL_EMAIL) && new Date(m.Created ?? 0).getTime() > since - 30000);
      if (msg) {
        const body = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json();
        link = `${body.Text ?? ""} ${body.HTML ?? ""}`.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^"'\s<>\]]+/)?.[0]?.replace(/&amp;/g, "&") ?? null;
      }
    } catch {}
  }
  if (link) {
    const verify = await fetch(link, { redirect: "manual" });
    const code = new URL(verify.headers.get("location") ?? "", BASE).searchParams.get("code");
    if (code) {
      await p2.goto(`${BASE}/portal/auth/callback?code=${code}`, { waitUntil: "domcontentloaded" });
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() });
      // reuse p2's cookies for mobile portal: portal session lives in ctx? p2 shares ctx. Use ctx state.
      const mp = await mobile.newPage();
      for (const r of ["/portal/dashboard", "/portal/plan", "/portal/progress"]) {
        await mp.goto(`${BASE}${r}`, { waitUntil: "networkidle" }).catch(() => {});
        await mp.waitForTimeout(700);
        await mp.screenshot({ path: join(OUT, `07-mobile${r.replace(/\//g, "-")}.png`), fullPage: true });
        note(`shot: mobile ${r}`);
      }
      await mobile.close();
      for (const r of ["/portal/dashboard", "/portal/plan"]) {
        await p2.goto(`${BASE}${r}`, { waitUntil: "networkidle" }).catch(() => {});
        await p2.waitForTimeout(700);
        await p2.screenshot({ path: join(OUT, `08-desktop${r.replace(/\//g, "-")}.png`), fullPage: true });
        note(`shot: desktop ${r}`);
      }
    } else note("PORTAL GAP: no code from verify");
  } else note("PORTAL GAP: no magic link harvested");
} catch (e) {
  note(`JOURNEY ERROR: ${String(e).slice(0, 300)}`);
  await page.screenshot({ path: join(OUT, "99-error-state.png"), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(join(OUT, "journey-manifest.json"), JSON.stringify({ generated: "2026-07-19", log }, null, 2));
  await browser.close();
  console.log("JOURNEY DONE — " + log.length + " events");
}
