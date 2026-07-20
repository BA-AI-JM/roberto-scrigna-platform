/**
 * Walkthrough recorder — one continuous 1280x720 take of the approved script
 * (docs/demo/WALKTHROUGH-SCRIPT.md). Run reset-take.sh BEFORE every take.
 *
 * Run: node docs/demo/record.mjs
 * Output: docs/demo/raw/<hash>.webm + docs/demo/raw/beats.json (beat → elapsed s)
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = decodeURIComponent(dirname(fileURLToPath(import.meta.url)));
const RAW = join(HERE, "raw");
mkdirSync(RAW, { recursive: true });

const BASE = "http://localhost:3001";
const MAILPIT = "http://127.0.0.1:54324";
const CLIENT_ID = "9dacdf1b-a9b2-4881-8049-f241ebea53ec";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const beats = [];
let recStart = 0;
let currentBeat = null;
function beat(name) {
  const t = (Date.now() - recStart) / 1000;
  if (currentBeat) currentBeat.t1 = t;
  currentBeat = { name, t0: t, t1: null };
  beats.push(currentBeat);
  console.log(`[${t.toFixed(1)}s] BEAT ${name}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: RAW, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
recStart = Date.now();

// ── overlay helpers (all pointer-events:none, re-inject after every goto) ──
async function caption(kicker, text) {
  await page.evaluate(
    ([k, t]) => {
      document.getElementById("__cap")?.remove();
      if (!t && !k) return;
      const d = document.createElement("div");
      d.id = "__cap";
      d.style.cssText =
        "position:fixed;left:50%;bottom:36px;transform:translateX(-50%);max-width:920px;" +
        "background:rgba(17,24,28,0.92);color:#fff;padding:14px 26px;border-radius:14px;" +
        "z-index:2147483647;pointer-events:none;font-family:-apple-system,'Segoe UI',sans-serif;" +
        "text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.35)";
      d.innerHTML =
        (k ? `<div style="font-size:11px;letter-spacing:0.14em;color:#7fd4c1;font-weight:700;margin-bottom:4px">${k}</div>` : "") +
        `<div style="font-size:17px;line-height:1.45">${t}</div>`;
      document.body.appendChild(d);
    },
    [kicker, text]
  );
}
async function slide(title, sub, holdMs) {
  await page.evaluate(
    ([t, s]) => {
      const d = document.createElement("div");
      d.id = "__slide";
      d.style.cssText =
        "position:fixed;inset:0;background:#10201c;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;z-index:2147483646;pointer-events:none;" +
        "font-family:Georgia,'Times New Roman',serif";
      d.innerHTML =
        `<div style="color:#f4f1ea;font-size:52px;letter-spacing:-0.01em">${t}</div>` +
        (s ? `<div style="color:#7fd4c1;font-size:20px;margin-top:18px;font-family:-apple-system,sans-serif">${s}</div>` : "");
      document.body.appendChild(d);
    },
    [title, sub]
  );
  await sleep(holdMs);
  await page.evaluate(() => document.getElementById("__slide")?.remove());
}
async function settle(ms = 1200) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await sleep(ms);
}
async function scrollTo(y) {
  await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "smooth" }), y);
  await sleep(1600);
}

try {
  // ── 1. Title over the login page ──────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  beat("title");
  await slide("Scrigna Nutrition", "dal piano al progresso, tutto verificato", 3200);

  // ── 2. Coach login ────────────────────────────────────────────────
  beat("login");
  await sleep(1200); // hydration
  await caption("ACCESSO PROFESSIONISTA", "La nuova identità visiva accoglie il coach.");
  await page.locator("#email").pressSequentially("roberto@test.com", { delay: 55 });
  await sleep(400);
  await page.locator("#password").pressSequentially("testpass123", { delay: 55 });
  await sleep(800);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await settle(1500);

  // ── 3. Oggi dashboard (light) ─────────────────────────────────────
  beat("dashboard-light");
  await caption("OGGI", "La giornata del coach in un colpo d'occhio: numeri veri, nota composta dai dati live.");
  await sleep(2500);
  await scrollTo(450);
  await sleep(1200);
  await scrollTo(900);
  await sleep(1500);
  await scrollTo(0);
  await sleep(800);

  // ── 4. Dark-mode flip ─────────────────────────────────────────────
  beat("dark-mode");
  await caption("TEMA SCURO", "Stesso contenuto, prima classe anche di notte: un attributo, zero reload.");
  await sleep(900);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await sleep(2600);
  await scrollTo(400);
  await sleep(1500);
  await scrollTo(0);
  await sleep(900);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await sleep(1300);

  // ── 5. Atleti → Niccolò detail ────────────────────────────────────
  beat("atleti");
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  await settle();
  await caption("ATLETI", "Gli atleti di Roberto. Questa sezione è in migrazione al nuovo design, come Fatturazione e Impostazioni.");
  await sleep(3000);
  await page.goto(`${BASE}/clients/${CLIENT_ID}`, { waitUntil: "networkidle" });
  await settle();
  await caption("STORICO CHECK-IN", "Niccolò: 92,0 → 91,7 kg in una settimana, aderenza reale registrata dai check-in.");
  await sleep(1500);
  const checkinTab = page.getByText("Check-in", { exact: true }).first();
  if (await checkinTab.count()) await checkinTab.click().catch(() => {});
  await sleep(1000);
  await scrollTo(500);
  await sleep(2000);

  // ── 6. Piani ──────────────────────────────────────────────────────
  beat("piani");
  await page.goto(`${BASE}/plans`, { waitUntil: "networkidle" });
  await settle();
  await caption("PIANI", "Ogni piano, con stato e atleta.");
  await sleep(2500);

  // ── 7–10. Wizard ──────────────────────────────────────────────────
  beat("wizard-1-cliente");
  await page.goto(`${BASE}/plans/generate`, { waitUntil: "networkidle" });
  await settle();
  await caption("NUOVO PIANO · 1 CLIENTE", "I dati snapshot di Niccolò entrano nel piano da soli.");
  await sleep(1500);
  await page.locator("select").first().selectOption(CLIENT_ID);
  await sleep(3200); // snapshot + engine preview
  await scrollTo(350);
  await sleep(1500);
  await scrollTo(0);

  beat("wizard-2-obiettivo");
  await page.getByRole("button", { name: /Continua/ }).click();
  await sleep(1200);
  await caption("2 OBIETTIVO", "Mantenimento: l'obiettivo guida il motore.");
  await sleep(2600);

  beat("wizard-3-struttura");
  await page.getByRole("button", { name: /Continua/ }).click();
  await sleep(1200);
  await caption("3 STRUTTURA SETTIMANA", "La settimana di Niccolò, giorno per giorno.");
  await sleep(2600);

  beat("wizard-4-genera");
  await page.getByRole("button", { name: /Continua/ }).click();
  await sleep(1200);
  await caption("4 RIVEDI E GENERA", "⌘↵ — il motore calcola il piano in diretta: nessun contenuto preconfezionato.");
  await sleep(2600);
  await page.getByRole("button", { name: /Genera piano/ }).click();
  await caption("IL MOTORE LAVORA", "Calcolo live di TDEE, macro e pasti per ogni tipo di giorno…");
  await page.waitForURL("**/review**", { timeout: 120000 });
  const draftId = page.url().match(/plans\/([0-9a-f-]+)\/review/)?.[1];
  await settle(2000);

  // ── 11. ★ Verdict strip ───────────────────────────────────────────
  beat("star-verdict");
  await caption("VERIFICA DEL MOTORE ±5%", "I verdetti di tolleranza del motore stesso, con i delta esatti: niente inventato, niente nascosto.");
  const verdict = page.getByText("regola motore", { exact: false }).first();
  await verdict.waitFor({ timeout: 10000 });
  await verdict.scrollIntoViewIfNeeded();
  await sleep(5200);

  // ── 12. Tabs sweep ────────────────────────────────────────────────
  beat("tabs");
  await caption("IL PIANO COMPLETO", "Corpo, macro, pasti, integratori, monitoraggio, versioni: una pagina.");
  for (const tab of ["Macro", "Pasti", "Integratori", "Monitoraggio", "Versioni", "Panoramica"]) {
    await page.getByRole("button", { name: tab, exact: true }).first().click();
    await sleep(2100);
  }

  // ── 13. Scarica PDF (real endpoint output, page 1 via sips) ───────
  beat("pdf");
  await caption("SCARICA PDF", "Il PDF reale del piano, generato adesso.");
  await page.getByRole("button", { name: /Scarica PDF/ }).hover();
  await sleep(1400);
  const pdfResp = await page.request.get(`${BASE}/api/pdf/${draftId}`, { timeout: 120000 });
  if (!pdfResp.ok()) throw new Error(`pdf ${pdfResp.status()}`);
  const pdfFile = join(RAW, "take-plan.pdf");
  writeFileSync(pdfFile, await pdfResp.body());
  execSync(`sips -s format png "${pdfFile}" --out "${join(RAW, "take-plan.png")}"`);
  await page.goto(`file://${join(RAW, "take-plan.png")}`);
  await sleep(500);
  await page.evaluate(() => {
    document.body.style.background = "#3a3f42";
    const img = document.querySelector("img");
    if (img) img.style.cssText = "display:block;margin:0 auto;height:100vh;width:auto";
  });
  await caption("SCARICA PDF", "La prima pagina del report firmato Scrigna — pronto per l'atleta.");
  await sleep(4200);
  await page.goto(`${BASE}/plans/${draftId}/review`, { waitUntil: "networkidle" });
  await settle();

  // ── 14. Condividi con cliente (never send) ────────────────────────
  beat("condividi");
  await caption("CONDIVIDI CON CLIENTE", "L'email di riepilogo pronta da inviare — oggi resta qui.");
  await page.getByRole("button", { name: /Condividi con [Cc]liente/ }).first().click();
  await sleep(3200);
  // The modal has no Escape handler — close it the way a human would.
  await page.getByRole("button", { name: "Annulla" }).click();
  await sleep(1000);

  // ── 15. Approva (shown, never clicked) ────────────────────────────
  beat("approva");
  await caption("APPROVA", "Un solo piano attivo per atleta: approvare archivierebbe il piano corrente. Lo lasciamo attivo.");
  await page.getByRole("button", { name: /^Approva/ }).first().hover();
  await sleep(3600);

  // ── 16. Section slide → portal ────────────────────────────────────
  beat("slide-portal");
  await slide("Il portale dell'atleta", "accesso senza password, dati in tempo reale", 3600);

  // ── 17. Portal magic-link login ───────────────────────────────────
  beat("portal-login");
  await page.goto(`${BASE}/portal/login`, { waitUntil: "networkidle" });
  await sleep(1400);
  await caption("ACCESSO SENZA PASSWORD", "Niccolò riceve un link via email: nessuna password da ricordare.");
  await page.locator('input[type="email"]').pressSequentially("niccolo@test.com", { delay: 60 });
  await sleep(700);
  const sentAt = Date.now();
  await page.locator('button[type="submit"]').first().click();
  await sleep(1800);

  // fetch the magic link (API) while showing the real Mailpit inbox on camera
  let link = null;
  const linkPoll = (async () => {
    for (let i = 0; i < 20 && !link; i++) {
      await sleep(1200);
      const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=5`)).json();
      const msg = (list.messages ?? []).find(
        (m) => m.To?.some((t) => t.Address === "niccolo@test.com") && new Date(m.Created).getTime() > sentAt - 60000
      );
      if (!msg) continue;
      const detail = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      const body = `${detail.HTML ?? ""}\n${detail.Text ?? ""}`.replace(/&amp;/g, "&");
      link = body.match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]+/)?.[0] ?? null;
    }
  })();
  await page.goto(MAILPIT, { waitUntil: "networkidle" });
  await settle();
  await caption("LA MAIL È ARRIVATA", "Il link di accesso, appena recapitato nella casella di Niccolò.");
  await sleep(2600);
  const mailRow = page.getByText("niccolo@test.com", { exact: false }).first();
  if (await mailRow.count()) await mailRow.click().catch(() => {});
  await sleep(2800);
  await linkPoll;
  if (!link) throw new Error("magic link not found in Mailpit");
  await page.goto(link, { waitUntil: "networkidle" });
  await page.waitForURL("**/portal/**", { timeout: 20000 });
  await settle(1500);

  // ── 18. Ciao Niccolò ──────────────────────────────────────────────
  beat("portal-dashboard");
  await caption("CIAO, NICCOLÒ", "Peso, variazione e ultimo check-in, appena entrato.");
  await sleep(3200);

  // ── 19. Registra peso (live) ──────────────────────────────────────
  beat("registra-peso");
  await page.locator("#lw-weight").scrollIntoViewIfNeeded();
  await sleep(1200);
  await caption("REGISTRA PESO", "91,3 kg registrati in diretta: il trend si aggiorna subito.");
  await page.locator("#lw-weight").pressSequentially("91.3", { delay: 90 });
  await sleep(900);
  await page.getByRole("button", { name: /^Registra$/ }).click();
  await sleep(3200);

  // ── 20. Statistiche Rapide ────────────────────────────────────────
  beat("statistiche");
  const stats = page.getByText("Statistiche Rapide", { exact: false }).first();
  await stats.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(1000);
  await caption("STATISTICHE RAPIDE", "Trend in discesa: 92,0 → 91,7 → 91,5 → 91,3.");
  await scrollTo(await page.evaluate(() => window.scrollY + 260));
  await sleep(3000);

  // ── 21. Portal plan ───────────────────────────────────────────────
  beat("portal-plan");
  await page.goto(`${BASE}/portal/plan`, { waitUntil: "networkidle" });
  await settle();
  await caption("IL PIANO ATTIVO", "Il piano approvato dal coach, come lo vede Niccolò: 14 giorni sul piano.");
  await sleep(2200);
  await scrollTo(450);
  await sleep(1800);

  // ── 22. Diario ────────────────────────────────────────────────────
  beat("diario");
  await page.goto(`${BASE}/portal/diary`, { waitUntil: "networkidle" });
  await settle();
  await caption("DIARIO", "Il diario alimentare di oggi: pasti e macro inseriti dall'atleta.");
  await sleep(2200);
  await scrollTo(420);
  await sleep(2000);

  // ── 23. Progressi ─────────────────────────────────────────────────
  beat("progressi");
  await page.goto(`${BASE}/portal/progress`, { waitUntil: "networkidle" });
  await settle();
  await caption("PROGRESSI", "Composizione e andamento del peso nel tempo — quattro punti, tutti veri.");
  await sleep(2200);
  await scrollTo(430);
  await sleep(2400);

  // ── 24. Outro ─────────────────────────────────────────────────────
  beat("outro");
  await caption(null, null);
  await slide("Scrigna Nutrition", "Piani verificati · Portale senza password · Progressi reali", 4200);
  beat("end");
} catch (e) {
  console.error(`TAKE FAILED at beat "${currentBeat?.name}":`, e.message);
  await page.screenshot({ path: join(RAW, `FAIL-${currentBeat?.name ?? "unknown"}.png`) }).catch(() => {});
  process.exitCode = 1;
} finally {
  const video = page.video();
  await ctx.close();
  const path = video ? await video.path() : null;
  writeFileSync(join(RAW, "beats.json"), JSON.stringify(beats, null, 2));
  console.log("video:", path);
  console.log("beats written:", beats.length);
  await browser.close();
}
