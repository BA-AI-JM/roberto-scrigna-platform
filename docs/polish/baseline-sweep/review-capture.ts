import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "journey");
const BASE = "http://localhost:3001";
const PLAN = "bafce20c-9a67-4fe7-8c95-22f6c40f9f84";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" }); await page.waitForTimeout(1000);
await page.getByLabel("Email").fill("roberto@test.com"); await page.getByLabel("Password").fill("testpass123");
const b = page.getByRole("button", { name: "Accedi" });
if (await b.isDisabled()) { await page.getByLabel("Email").pressSequentially("roberto@test.com", { delay: 15 }); await page.getByLabel("Password").pressSequentially("testpass123", { delay: 15 }); }
await b.click(); await page.waitForURL("**/dashboard", { timeout: 15000 });
await page.goto(`${BASE}/plans/${PLAN}/review`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, "review-populated-default.png"), fullPage: true });
console.log("default shot @", page.url());
for (const t of ["Macro", "Pasti", "Integratori", "Monitoraggio", "Versioni", "Panoramica"]) {
  try {
    await page.locator("button", { hasText: t }).first().click({ timeout: 2500 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `review-pop-${t.toLowerCase()}.png`), fullPage: true });
    console.log("tab:", t);
  } catch { console.log("miss:", t); }
}
await browser.close(); console.log("REVIEW CAPTURE DONE");
