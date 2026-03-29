/**
 * PDF Report Generator Module
 *
 * Branded Puppeteer-based PDF generator for Roberto Scrigna nutrition plans.
 * Structure: cover, paziente, circonferenze, pliche, anamnesi, allenamento,
 * stile di vita, obiettivo, body comp analysis, monitoring, macro table,
 * day-type meal plans, supplements, guidance.
 */

// Types
export type {
  PdfClientInfo,
  Circonferenze,
  Pliche,
  AnamnestiAllenamento,
  StileVita,
  Obiettivo,
  MonitoringConfig,
  SupplementEntry,
  GuidanceSection,
  DayTypePlanSummary,
  PdfReportData,
  PdfGenerateOptions,
} from "./types";

// Styles
export { BRAND, DAY_TYPE_COLOURS, generateCSS } from "./styles";

// HTML Renderer
export { renderReportHtml } from "./html-renderer";

// PDF Generator (Puppeteer)
export { generatePdf } from "./generator";
