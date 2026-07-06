/**
 * Engagement-letter PDF generation (Requirement #29, Stage 1) — Puppeteer seam.
 *
 * Kept in its own module so the tRPC router (and its tests) can `vi.mock` it
 * without launching Chromium. Mirrors the invoice PDF route's inline puppeteer
 * block (puppeteer-core + @sparticuz/chromium); the pure HTML comes from
 * src/pdf/engagement-letter-renderer.ts.
 */

import "server-only";
import { launchPdfBrowser } from "../pdf/chromium-launcher";

/** Render a full HTML document to a PDF buffer. */
export async function generateEngagementLetterPdf(html: string): Promise<Uint8Array> {
  const browser = await launchPdfBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
