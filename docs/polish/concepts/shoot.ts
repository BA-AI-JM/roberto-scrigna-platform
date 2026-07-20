import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const D = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto("file://" + join(D, "concept-board.html"), { waitUntil: "networkidle" });
await page.waitForTimeout(1200); // webfonts
const sections = await page.locator("section.surface").all();
const names = ["1-dashboard", "2-wizard", "3-review", "4-portal-oggi", "5-login"];
for (let i = 0; i < sections.length; i++) {
  await sections[i]!.screenshot({ path: join(D, `concept-${names[i]}.png`) });
  console.log("shot:", names[i]);
}
await page.screenshot({ path: join(D, "concept-full-board.png"), fullPage: true });
await browser.close();
console.log("BOARD SHOT DONE");
