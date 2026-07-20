import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const D = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 })).newPage();
await page.goto("file://" + join(D, "concept-board-v2.html"), { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
const wraps = await page.locator(".wrap").all();
for (const w of wraps) {
  const name = await w.getAttribute("data-name");
  const theme = await w.getAttribute("data-theme");
  await w.screenshot({ path: join(D, `v2-${name}-${theme}.png`) });
  console.log("shot:", name, theme);
}
await browser.close();
console.log("V2 DONE");
