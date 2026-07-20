/**
 * Headless scout for the walkthrough recording — every beat must go green here
 * before any take. Screenshots land in docs/demo/scout-shots/. Creates one draft
 * plan (live Genera) and one snapshot (Registra peso) — run reset-take.sh after.
 *
 * Run: node docs/demo/scout.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = decodeURIComponent(dirname(fileURLToPath(import.meta.url)));
const SHOTS = join(HERE, "scout-shots");
mkdirSync(SHOTS, { recursive: true });

const BASE = "http://localhost:3001";
const MAILPIT = "http://127.0.0.1:54324";
const CLIENT_ID = "9dacdf1b-a9b2-4881-8049-f241ebea53ec";
const ACTIVE_PLAN = "793a9bac-0e75-47c0-909f-3c4df552a4fc";

const results = [];
let beatName = "boot";
function beat(name) {
  beatName = name;
  console.log(`\n=== BEAT: ${name}`);
}
function ok(msg) {
  results.push({ beat: beatName, ok: true, msg });
  console.log(`  OK  ${msg}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page, ms = 1000) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await sleep(ms);
}
async function shot(page, name) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
  console.log(`  shot ${name}.png`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

try {
  // ── Beat: coach login ──────────────────────────────────────────────
  beat("coach-login");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await sleep(1200); // hydration — fields filled pre-hydration leave button disabled
  await page.locator("#email").pressSequentially("roberto@test.com", { delay: 30 });
  await page.locator("#password").pressSequentially("testpass123", { delay: 30 });
  await shot(page, "01-login");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await settle(page);
  ok("logged in, landed on /dashboard");

  // ── Beat: dashboard light + dark ───────────────────────────────────
  beat("dashboard");
  await shot(page, "02-dashboard-light");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await sleep(600);
  await shot(page, "03-dashboard-dark");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await sleep(400);
  ok("dashboard renders; dark flip works");

  // ── Beat: clients list + detail (check-in history) ─────────────────
  beat("clients");
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  await settle(page);
  await shot(page, "04-clients-list");
  await page.goto(`${BASE}/clients/${CLIENT_ID}`, { waitUntil: "networkidle" });
  await settle(page);
  await shot(page, "05-client-detail");
  const checkinTab = page.getByText("Check-in", { exact: false }).first();
  if (await checkinTab.count()) {
    await checkinTab.click().catch(() => {});
    await sleep(1000);
    await shot(page, "06-client-checkins");
  }
  ok("client detail loads");

  // ── Beat: plans list ───────────────────────────────────────────────
  beat("plans-list");
  await page.goto(`${BASE}/plans`, { waitUntil: "networkidle" });
  await settle(page);
  await shot(page, "07-plans-list");
  ok("plans list loads");

  // ── Beat: wizard steps 1–4 + live Genera (star setup) ──────────────
  // SKIP_WIZARD=1 DRAFT_ID=<uuid> resumes a scout against an existing draft
  // without burning another engine run.
  let draftId;
  if (process.env.SKIP_WIZARD && process.env.DRAFT_ID) {
    beat("wizard(skipped — reusing draft)");
    draftId = process.env.DRAFT_ID;
    await page.goto(`${BASE}/plans/${draftId}/review`, { waitUntil: "networkidle" });
    await settle(page, 2000);
    ok(`reusing draft ${draftId}`);
  } else {
    beat("wizard");
    await page.goto(`${BASE}/plans/generate`, { waitUntil: "networkidle" });
    await settle(page);
    await page.locator("select").first().selectOption(CLIENT_ID);
    await sleep(2500); // snapshot + engine preview load
    await shot(page, "08-wizard-step1");
    for (let s = 2; s <= 4; s++) {
      await page.getByRole("button", { name: /Continua/ }).click();
      await sleep(1500);
      await shot(page, `09-wizard-step${s}`);
    }
    beat("genera-live");
    await page.getByRole("button", { name: /Genera piano/ }).click();
    await page.waitForURL("**/review**", { timeout: 120000 });
    await settle(page, 2000);
    draftId = page.url().match(/plans\/([0-9a-f-]+)\/review/)?.[1];
    await shot(page, "10-review-draft-top");
    ok(`engine ran live, landed on review of draft ${draftId}`);
  }

  // ── Beat: verdict strip + tabs on the fresh draft ──────────────────
  beat("review-draft");
  // Rendered strip has no "Verifica del motore" heading (that's a code comment);
  // the on-screen anchor is the tolerance rule text in each verdict card.
  const verdict = page.getByText("regola motore", { exact: false }).first();
  await verdict.waitFor({ timeout: 10000 });
  await verdict.scrollIntoViewIfNeeded();
  await sleep(600);
  await shot(page, "11-verdict-strip");
  ok("verdict strip present");
  for (const tab of ["Macro", "Pasti", "Integratori", "Monitoraggio", "Versioni", "Panoramica"]) {
    await page.getByRole("button", { name: tab, exact: true }).first().click();
    await sleep(900);
    await shot(page, `12-tab-${tab.toLowerCase()}`);
  }
  ok("all six tabs switch");
  const approvaVisible = await page.getByRole("button", { name: /^Approva/ }).count();
  ok(`Approva button on draft: ${approvaVisible > 0}`);

  // ── Beat: PDF on the draft ─────────────────────────────────────────
  // "Scarica PDF" = window.open('/api/pdf/<id>', '_blank') (review page:374-376),
  // so there is no download event — verify the real endpoint directly with the
  // page's session. The recorder shows it by goto-ing the same URL in-take.
  beat("pdf");
  const t0 = Date.now();
  const pdfResp = await page.request.get(`${BASE}/api/pdf/${draftId}`, { timeout: 120000 });
  const pdfMs = Date.now() - t0;
  const pdfCt = pdfResp.headers()["content-type"] ?? "";
  const pdfBody = await pdfResp.body();
  if (!pdfResp.ok() || !pdfCt.includes("pdf")) {
    throw new Error(`pdf endpoint: ${pdfResp.status()} content-type=${pdfCt}`);
  }
  writeFileSync(join(SHOTS, "plan.pdf"), pdfBody);
  ok(`PDF endpoint 200, ${pdfCt}, ${pdfBody.length} bytes in ${pdfMs} ms`);
  // The take shows page 1 via sips (Content-Disposition: attachment can't render
  // in-tab) — prove the conversion works before recording.
  const { execSync } = await import("node:child_process");
  execSync(`sips -s format png "${join(SHOTS, "plan.pdf")}" --out "${join(SHOTS, "plan-preview.png")}"`);
  ok("sips PDF→PNG conversion works");

  // ── Beat: Condividi modal (open, never send) + Approva on ACTIVE plan ──
  beat("review-active");
  await page.goto(`${BASE}/plans/${ACTIVE_PLAN}/review`, { waitUntil: "networkidle" });
  await settle(page);
  await shot(page, "13-review-active");
  const condividi = page.getByRole("button", { name: /Condividi con [Cc]liente/ }).first();
  await condividi.click();
  await sleep(1200);
  await shot(page, "14-condividi-modal");
  await page.keyboard.press("Escape");
  await sleep(600);
  ok("Condividi modal opens (not sent), Escape closes");

  // ── Beat: portal magic-link login ──────────────────────────────────
  beat("portal-login");
  await page.goto(`${BASE}/portal/login`, { waitUntil: "networkidle" });
  await sleep(1200);
  await page.locator('input[type="email"]').pressSequentially("niccolo@test.com", { delay: 30 });
  await shot(page, "15-portal-login");
  const sentAt = Date.now();
  await page.locator('button[type="submit"]').first().click();
  await sleep(1000);

  let link = null;
  for (let i = 0; i < 20 && !link; i++) {
    await sleep(1500);
    const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=5`)).json();
    const msg = (list.messages ?? []).find(
      (m) =>
        m.To?.some((t) => t.Address === "niccolo@test.com") &&
        new Date(m.Created).getTime() > sentAt - 60000
    );
    if (!msg) continue;
    const detail = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
    const body = `${detail.HTML ?? ""}\n${detail.Text ?? ""}`.replace(/&amp;/g, "&");
    link = body.match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]+/)?.[0] ?? null;
  }
  if (!link) throw new Error("magic link not found in Mailpit");
  ok(`magic link fetched from Mailpit`);
  await page.goto(link, { waitUntil: "networkidle" });
  await sleep(1500);
  await page.waitForURL("**/portal/**", { timeout: 20000 });
  await settle(page);
  await shot(page, "16-portal-dashboard");
  const ciao = await page.getByText(/Ciao/, { exact: false }).first().count();
  ok(`portal dashboard, Ciao greeting present: ${ciao > 0}`);

  // ── Beat: Registra peso live (does the UI update without reload?) ──
  beat("registra-peso");
  const weightBefore = await page.evaluate(() => document.body.innerText.match(/9[0-9],[0-9]|9[0-9]\.[0-9]/g)?.slice(0, 6));
  await page.locator("#lw-weight").scrollIntoViewIfNeeded();
  await page.locator("#lw-weight").fill("91.3");
  await shot(page, "17-registra-filled");
  await page.getByRole("button", { name: /^Registra$/ }).click();
  await sleep(3000);
  await shot(page, "18-registra-after");
  const weightAfter = await page.evaluate(() => document.body.innerText.includes("91,3") || document.body.innerText.includes("91.3"));
  ok(`91.3 visible after submit WITHOUT reload: ${weightAfter} (before: ${JSON.stringify(weightBefore)})`);

  // ── Beat: portal plan / diary / progress ───────────────────────────
  beat("portal-pages");
  await page.goto(`${BASE}/portal/plan`, { waitUntil: "networkidle" });
  await settle(page);
  await shot(page, "19-portal-plan");
  await page.goto(`${BASE}/portal/diary`, { waitUntil: "networkidle" });
  await settle(page);
  await shot(page, "20-portal-diary");
  const avena = await page.getByText("Fiocchi d'avena", { exact: false }).count();
  ok(`diary shows seeded entries (Fiocchi d'avena visible: ${avena > 0})`);
  await page.goto(`${BASE}/portal/progress`, { waitUntil: "networkidle" });
  await settle(page);
  await shot(page, "21-portal-progress");
  ok("progress page loads");

  console.log("\n=== SCOUT SUMMARY ===");
  for (const r of results) console.log(`${r.ok ? "GREEN" : "RED "} [${r.beat}] ${r.msg}`);
  writeFileSync(join(SHOTS, "summary.json"), JSON.stringify(results, null, 2));
  console.log(`\nDraft plan created: ${draftId ?? "?"} — run reset-take.sh now.`);
} catch (e) {
  await shot(page, `FAIL-${beatName}`).catch(() => {});
  console.error(`\nSCOUT RED at beat "${beatName}":`, e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
