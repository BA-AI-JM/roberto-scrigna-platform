/**
 * Shared serverless-Chromium launcher for every PDF path (engagement letter,
 * invoice, plan). Single source of truth so the three renderers can't drift.
 *
 * WHY @sparticuz/chromium-min + a REMOTE binary:
 * The Next 16 **Turbopack** production build relocated `@sparticuz/chromium` into
 * a chunk (verified: identical chunk hash before/after `serverExternalPackages` —
 * that config is a no-op under this Turbopack build). At runtime the relocated
 * `executablePath()` then couldn't find its sibling `bin/` dir and threw
 * `The input directory ".../@sparticuz/chromium/bin" does not exist`.
 *
 * `@sparticuz/chromium-min` ships NO binary — it downloads the Chromium pack from
 * a URL at runtime and extracts to /tmp. There is no `bin/` to bundle or trace,
 * so the bundling problem cannot occur regardless of how Turbopack packages it.
 *
 * The pack version MUST match the installed `@sparticuz/chromium-min` version or
 * puppeteer-core throws a protocol mismatch. Vercel/AWS Lambda is x64.
 */
import chromium from "@sparticuz/chromium-min";
import puppeteerCore, { type Browser } from "puppeteer-core";

/** Keep in lockstep with `@sparticuz/chromium-min` in package.json. */
const CHROMIUM_VERSION = "147.0.2";

/** Remote Chromium pack (override with CHROMIUM_PACK_URL). x64 = Vercel/Lambda. */
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.x64.tar`;

/**
 * Resolve the Chromium executable:
 *  1. CHROMIUM_PATH override (CI / custom setups)
 *  2. On Vercel → fetch + extract the remote pack (chromium-min, never bundled)
 *  3. Local → undefined; puppeteer-core falls back to the system browser
 */
async function resolveExecutablePath(): Promise<string | undefined> {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (process.env.VERCEL) return chromium.executablePath(CHROMIUM_PACK_URL);
  return undefined;
}

/** Launch a headless, serverless-compatible Chromium for PDF rendering. */
export async function launchPdfBrowser(): Promise<Browser> {
  const executablePath = await resolveExecutablePath();
  return puppeteerCore.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 800 },
    executablePath,
    headless: true,
  });
}
