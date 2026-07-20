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

/** Hardcoded for bundling safety; update in lockstep with chromium-min in package.json. */
const CHROMIUM_VERSION = "147.0.2";
const CHROMIUM_LAUNCH_TIMEOUT_MS = 25_000;
const CHROMIUM_RETRY_BACKOFF_MS = 500;

/** Default remote Chromium pack. x64 = Vercel/Lambda. */
const DEFAULT_CHROMIUM_PACK_URL =
  `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.x64.tar`;

/** Distinguishes unavailable PDF infrastructure from document/rendering errors. */
export class PdfDependencyError extends Error {
  override readonly name = "PdfDependencyError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

function configuredPackUrl(): string {
  return process.env.CHROMIUM_PACK_URL ?? DEFAULT_CHROMIUM_PACK_URL;
}

function assertPackVersion(packUrl: string): void {
  if (packUrl.includes(CHROMIUM_VERSION)) return;

  const packVersion = packUrl.match(/\d+\.\d+\.\d+/)?.[0] ?? "unknown";
  throw new PdfDependencyError(
    `Chromium pack version mismatch: URL pack version ${packVersion}; installed chromium-min version ${CHROMIUM_VERSION}.`
  );
}

function logChromiumSource(): void {
  const source = process.env.CHROMIUM_PATH
    ? "CHROMIUM_PATH"
    : process.env.VERCEL
      ? process.env.CHROMIUM_PACK_URL
        ? "CHROMIUM_PACK_URL"
        : "default_github_release"
      : "puppeteer_default";

  console.info(
    JSON.stringify({
      event: "pdf_chromium_source",
      source,
      chromiumVersion: CHROMIUM_VERSION,
    })
  );
}

/**
 * Resolve the Chromium executable:
 *  1. CHROMIUM_PATH override (CI / custom setups)
 *  2. On Vercel → fetch + extract the remote pack (chromium-min, never bundled)
 *  3. Local → undefined; puppeteer-core falls back to the system browser
 */
async function resolveExecutablePath(): Promise<string | undefined> {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (process.env.VERCEL) {
    const packUrl = configuredPackUrl();
    assertPackVersion(packUrl);
    return chromium.executablePath(packUrl);
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchAttempt(): Promise<Browser> {
  const executablePath = await resolveExecutablePath();
  // chromium.args is tuned for the Lambda/Vercel sandbox (--single-process et
  // al.); on a local desktop Chrome those flags wedge the renderer and every
  // page.setContent times out. Only pass them where the sparticuz binary runs.
  const args = process.env.VERCEL ? chromium.args : [];
  return puppeteerCore.launch({
    args,
    defaultViewport: { width: 1280, height: 800 },
    executablePath,
    headless: true,
    timeout: CHROMIUM_LAUNCH_TIMEOUT_MS,
  });
}

async function launchWithTimeout(): Promise<Browser> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Chromium download/launch timed out after ${CHROMIUM_LAUNCH_TIMEOUT_MS}ms.`)),
      CHROMIUM_LAUNCH_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([launchAttempt(), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** Launch a headless, serverless-compatible Chromium for PDF rendering. */
export async function launchPdfBrowser(): Promise<Browser> {
  logChromiumSource();

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await launchWithTimeout();
    } catch (error) {
      if (error instanceof PdfDependencyError) throw error;
      lastError = error;
      if (attempt === 1) await delay(CHROMIUM_RETRY_BACKOFF_MS);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new PdfDependencyError(
    `PDF dependency unavailable after 2 attempts (chromium-min ${CHROMIUM_VERSION}): ${detail}`,
    { cause: lastError }
  );
}
