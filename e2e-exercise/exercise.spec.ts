/**
 * META-PROMPTED interaction exercise pass. For each route it: loads the page,
 * enumerates the interactive elements from the DOM (not hand-written per element),
 * drives buttons/tabs/toggles, and records anything that breaks — uncaught errors,
 * console errors, React error boundaries / Next error overlay, 5xx, failed navs.
 * Discovery only: it never fails the run; findings are written to findings.json.
 */
import { test, type Page, type BrowserContext } from "@playwright/test";
import fs from "fs";

const CLIENT = "6cab145c-0eb6-438e-bc32-c0e8193fa6e8"; // Niccolò Ambrosi (local seed)
const TOKEN = "01883adc-e049-4eaa-a964-c797ccc5ce66"; // completed check-in token

const COACH_ROUTES = [
  "/dashboard", "/clients", `/clients/${CLIENT}`, `/clients/${CLIENT}/edit`, `/clients/${CLIENT}/lettera`,
  "/plans", `/plans/generate?clientId=${CLIENT}`, "/invoices", "/invoices/new",
  "/monitoring", "/monitoring/training", "/monitoring/notifications", "/settings",
];
const UNAUTH_ROUTES = [
  "/login", "/register", "/portal/login", "/design/client-home-proposal",
  `/portal/checkin/${TOKEN}`, "/no-such-page-zzz",
];

const ERR_UI = /Qualcosa è andato storto|Errore imprevisto|Si è verificato un errore|Impossibile caric|Errore nel caric|DashboardError|Unable to load|Application error|client-side exception/i;
// Pages that hit tables absent from the (stale) LOCAL Supabase — errors here are
// environment noise (missing migrations 009 legal / 010 signature / 012 reminders),
// NOT app bugs. Tagged so the report can separate them.
const LOCAL_SCHEMA_ROUTES = [/\/lettera$/, /monitoring\/notifications/];
const SKIP_LABEL = /esci|logout|disconnett|archivi|elimina|rimuovi|cancella|revoca/i;
const IGNORE_CONSOLE = /favicon|React DevTools|hydrat|Warning: |preload|net::ERR_ABORTED|Download the|source ?map|\[Fast Refresh\]/i;

type Finding = { route: string; phase: "load" | "click" | "nav"; el?: string; severity: "high" | "med" | "low"; error: string };
const findings: Finding[] = [];
const exercised = { routes: 0, clicks: 0, navs: 0 };

function attach(page: Page, sink: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") { const t = m.text(); if (!IGNORE_CONSOLE.test(t)) sink.push("console: " + t.slice(0, 220)); }
  });
  page.on("pageerror", (e) => sink.push("pageerror: " + String(e).slice(0, 220)));
}
async function errorUi(page: Page): Promise<string | null> {
  // NB: do NOT test for the <nextjs-portal> element — it is present on every dev
  // page even with no error. Trust visible app error-boundary text instead.
  try {
    const body = await page.locator("body").innerText({ timeout: 2500 });
    const m = body.match(ERR_UI);
    return m ? "error-ui: " + m[0] : null;
  } catch { return null; }
}
function schemaTag(route: string): boolean {
  return LOCAL_SCHEMA_ROUTES.some((re) => re.test(route));
}

async function exercise(ctx: BrowserContext, route: string) {
  exercised.routes++;
  const page = await ctx.newPage();
  const sink: string[] = [];
  attach(page, sink);
  let status = 0;
  try {
    const resp = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = resp?.status() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  } catch (e) {
    findings.push({ route, phase: "load", severity: "high", error: "goto failed: " + String(e).slice(0, 120) });
    await page.close(); return;
  }
  const envTag = schemaTag(route) ? "[local-schema] " : "";
  const envSev = schemaTag(route) ? ("low" as const) : ("high" as const);
  if (status >= 500) findings.push({ route, phase: "load", severity: envSev, error: `${envTag}HTTP ${status}` });
  const loadUi = await errorUi(page);
  if (loadUi) findings.push({ route, phase: "load", severity: envSev, error: envTag + loadUi });
  for (const e of sink) findings.push({ route, phase: "load", severity: "med", error: e });

  // drive buttons/tabs/toggles — one new label per pass, re-enumerate (DOM may change / nav).
  const clicked = new Set<string>();
  for (let pass = 0; pass < 22; pass++) {
    const els = page.locator("button:visible, [role='tab']:visible, [role='switch']:visible");
    const n = await els.count().catch(() => 0);
    let acted = false;
    for (let i = 0; i < n; i++) {
      const el = els.nth(i);
      const label = ((await el.innerText().catch(() => "")).trim() || (await el.getAttribute("aria-label").catch(() => "")) || `#${i}`).slice(0, 44);
      if (clicked.has(label)) continue;
      clicked.add(label);
      if (SKIP_LABEL.test(label)) { acted = true; break; }
      if (await el.isDisabled().catch(() => false)) { acted = true; break; } // disabled-empty-form etc. — expected
      const before = sink.length;
      const url0 = page.url();
      exercised.clicks++;
      await el.click({ timeout: 3000 }).catch((e) => findings.push({ route, phase: "click", el: label, severity: "low", error: "click failed: " + String(e).slice(0, 90) }));
      await page.waitForTimeout(450);
      const ui = await errorUi(page);
      if (ui) findings.push({ route, phase: "click", el: label, severity: schemaTag(route) ? "low" : "high", error: (schemaTag(route) ? "[local-schema] " : "") + ui });
      for (const e of sink.slice(before)) findings.push({ route, phase: "click", el: label, severity: schemaTag(route) ? "low" : "med", error: (schemaTag(route) ? "[local-schema] " : "") + e });
      if (page.url() !== url0) { await page.goto(route, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {}); await page.waitForTimeout(500); }
      acted = true;
      break;
    }
    if (!acted) break;
  }
  await page.close();
}

async function navPass(ctx: BrowserContext, seeds: string[]) {
  const page = await ctx.newPage();
  const sink: string[] = [];
  attach(page, sink);
  const seen = new Set<string>();
  const targets = new Set<string>();
  for (const s of seeds) {
    await page.goto(s, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    const hrefs = await page.locator("a[href^='/']").evaluateAll((as) =>
      Array.from(new Set(as.map((a) => a.getAttribute("href")).filter((h): h is string => !!h && !h.startsWith("/api") && !h.includes("#"))))
    ).catch(() => [] as string[]);
    hrefs.forEach((h) => targets.add(h.split("?")[0]!));
  }
  for (const t of Array.from(targets).slice(0, 40)) {
    if (seen.has(t)) continue; seen.add(t);
    exercised.navs++;
    const resp = await page.goto(t, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
    const st = resp?.status() ?? 0;
    await page.waitForTimeout(300);
    const ui = await errorUi(page);
    if (st >= 500) findings.push({ route: t, phase: "nav", severity: "high", error: `HTTP ${st}` });
    if (ui) findings.push({ route: t, phase: "nav", severity: "high", error: ui });
  }
  await page.close();
}

test("coach surface — authed interaction crawl", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: "e2e-exercise/.auth.json" });
  for (const r of COACH_ROUTES) await exercise(ctx, r);
  await navPass(ctx, ["/dashboard", "/clients", `/clients/${CLIENT}`, "/plans", "/invoices", "/monitoring"]);
  await ctx.close();
});

test("unauth surface — interaction crawl", async ({ browser }) => {
  const ctx = await browser.newContext(); // no storageState
  for (const r of UNAUTH_ROUTES) await exercise(ctx, r);
  await ctx.close();
});

test.afterAll(() => {
  const summary = {
    exercised,
    findingCount: findings.length,
    high: findings.filter((f) => f.severity === "high"),
    med: findings.filter((f) => f.severity === "med"),
    low: findings.filter((f) => f.severity === "low"),
  };
  fs.writeFileSync("e2e-exercise/findings.json", JSON.stringify(summary, null, 2));
  console.log("EXERCISE SUMMARY", JSON.stringify(summary.exercised), "findings:", findings.length,
    "high:", summary.high.length, "med:", summary.med.length, "low:", summary.low.length);
});
