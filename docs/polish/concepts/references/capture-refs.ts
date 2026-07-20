/** Reference capture — public marketing pages, viewport-only (the design voice lives above the fold). */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const D = dirname(fileURLToPath(import.meta.url));

const TARGETS: [string, string][] = [
  ["whoop", "https://www.whoop.com"],
  ["trainingpeaks", "https://www.trainingpeaks.com"],
  ["everfit", "https://everfit.io"],
  ["healthie", "https://www.gethealthie.com"],
  ["levels", "https://www.levels.com"],
  ["attio", "https://attio.com"],
  ["amie", "https://www.amie.so"],
  ["linear", "https://linear.app"],
];

const browser = await chromium.launch();
for (const [name, url] of TARGETS) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    locale: "en-US",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3500); // hero animations settle
    // best-effort cookie dismissal
    for (const label of [/accept/i, /accetta/i, /agree/i, /got it/i, /allow all/i]) {
      const b = page.getByRole("button", { name: label }).first();
      if (await b.count().then((c) => c > 0).catch(() => false)) { await b.click({ timeout: 1500 }).catch(() => {}); break; }
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(D, `ref-${name}.png`) });
    console.log("ok:", name);
  } catch (e) {
    console.log("MISS:", name, String(e).slice(0, 80));
  }
  await ctx.close();
}
await browser.close();
console.log("REFS DONE");
