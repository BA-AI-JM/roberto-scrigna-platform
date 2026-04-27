/**
 * Puppeteer-based PDF generator for Roberto Scrigna branded nutrition reports.
 * Renders the HTML template into a high-quality A4 PDF.
 *
 * Uses @sparticuz/chromium + puppeteer-core for Vercel serverless compatibility.
 * On Vercel, chromium.executablePath() resolves the bundled serverless binary.
 * Locally, set CHROMIUM_PATH to your system Chromium/Chrome path, or leave
 * unset to let puppeteer-core fall back to the default system browser.
 */

import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";
import type { PdfReportData, PdfGenerateOptions } from "./types";
import { renderReportHtml } from "./html-renderer";

/**
 * Resolve the executable path for the Chromium/Chrome binary.
 *
 * Resolution order:
 *  1. CHROMIUM_PATH env var (explicit override — useful for CI or custom setups)
 *  2. On Vercel (VERCEL env var present): @sparticuz/chromium auto-detected path
 *  3. Locally: undefined — puppeteer-core falls back to the system browser
 */
async function resolveExecutablePath(): Promise<string | undefined> {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }
  if (process.env.VERCEL) {
    return chromium.executablePath();
  }
  return undefined;
}

/**
 * Generate a branded PDF report as a Buffer.
 *
 * Launches a headless Chromium instance, renders the HTML report,
 * and returns the resulting PDF as a Uint8Array buffer.
 *
 * @param data - Complete report data structure
 * @param options - PDF generation options
 * @returns PDF file contents as a Uint8Array
 */
export async function generatePdf(
  data: PdfReportData,
  options: PdfGenerateOptions = {}
): Promise<Uint8Array> {
  const html = renderReportHtml(data, options);

  const executablePath = await resolveExecutablePath();

  const browser = await puppeteerCore.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 800 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const format = options.format ?? "A4";

    const pdfBuffer = await page.pdf({
      format,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

/**
 * Generate the HTML string for a report without rendering to PDF.
 * Useful for previewing in a browser or testing the template.
 *
 * @param data - Complete report data structure
 * @param options - PDF generation options
 * @returns Complete HTML string
 */
export function generateReportHtml(
  data: PdfReportData,
  options: PdfGenerateOptions = {}
): string {
  return renderReportHtml(data, options);
}
