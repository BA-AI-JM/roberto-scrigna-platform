/**
 * Puppeteer-based PDF generator for Roberto Scrigna branded nutrition reports.
 * Renders the HTML template into a high-quality A4 PDF.
 */

import puppeteer from "puppeteer";
import type { PdfReportData, PdfGenerateOptions } from "./types";
import { renderReportHtml } from "./html-renderer";

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

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
