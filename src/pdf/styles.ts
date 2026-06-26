/**
 * CSS styles and colour palette for the branded PDF report.
 * Roberto Scrigna brand: deep navy, warm gold accent, clean sans-serif.
 */

// ── Brand Colours ───────────────────────────────────────────────────────────

/** Brand colour palette */
export const BRAND = {
  navy: "#1a2332",
  navyLight: "#2a3a4e",
  gold: "#c8a44e",
  goldLight: "#e8d08e",
  white: "#ffffff",
  offWhite: "#f8f9fa",
  grey: "#6c757d",
  greyLight: "#e9ecef",
  textDark: "#212529",
  textMuted: "#6c757d",
} as const;

/** Day-type colour coding */
export const DAY_TYPE_COLOURS = {
  training: { bg: "#e3f2fd", border: "#1565c0", text: "#0d47a1", label: "Allenamento" },
  rest: { bg: "#f3e5f5", border: "#7b1fa2", text: "#4a148c", label: "Riposo" },
  refeed: { bg: "#e8f5e9", border: "#2e7d32", text: "#1b5e20", label: "Refeed" },
  deload: { bg: "#fff3e0", border: "#e65100", text: "#bf360c", label: "Deload" },
  // #17 periodization intensity tiers (modes 3-4) — blue family, graded by intensity.
  training_light: { bg: "#e8f4fd", border: "#42a5f5", text: "#1565c0", label: "Allenamento Leggero" },
  training_medium: { bg: "#e3f2fd", border: "#1976d2", text: "#0d47a1", label: "Allenamento Medio" },
  training_intense: { bg: "#d6e9fb", border: "#1565c0", text: "#0d3c8c", label: "Allenamento Intenso" },
  training_double: { bg: "#e8eaf6", border: "#283593", text: "#1a237e", label: "Doppia Seduta" },
} as const;

// ── CSS Template ────────────────────────────────────────────────────────────

/**
 * Generate the full CSS stylesheet for the PDF report.
 * Uses hardcoded px values throughout for Puppeteer rendering consistency.
 */
export function generateCSS(): string {
  return `
    @page {
      size: A4;
      margin: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: ${BRAND.textDark};
      background: ${BRAND.white};
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 20mm 18mm;
      page-break-after: always;
      position: relative;
    }

    .page:last-child {
      page-break-after: auto;
    }

    /* ── Cover Page ────────────────────────────────────── */

    .cover {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 40mm 30mm;
    }

    .cover-logo {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: ${BRAND.navy};
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 30px;
    }

    .cover-logo-text {
      color: ${BRAND.gold};
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 2px;
    }

    .cover-title {
      font-size: 28px;
      font-weight: 700;
      color: ${BRAND.navy};
      margin-bottom: 8px;
      letter-spacing: 1px;
    }

    .cover-subtitle {
      font-size: 16px;
      color: ${BRAND.gold};
      font-weight: 500;
      margin-bottom: 40px;
      text-transform: uppercase;
      letter-spacing: 3px;
    }

    .cover-client {
      font-size: 22px;
      font-weight: 600;
      color: ${BRAND.navy};
      margin-bottom: 8px;
    }

    .cover-date {
      font-size: 13px;
      color: ${BRAND.grey};
    }

    .cover-divider {
      width: 60px;
      height: 3px;
      background: ${BRAND.gold};
      margin: 24px auto;
    }

    /* ── Section Headers ──────────────────────────────── */

    .section-header {
      background: ${BRAND.navy};
      color: ${BRAND.white};
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
      border-left: 4px solid ${BRAND.gold};
    }

    .subsection-header {
      font-size: 12px;
      font-weight: 600;
      color: ${BRAND.navy};
      border-bottom: 2px solid ${BRAND.gold};
      padding-bottom: 4px;
      margin-bottom: 12px;
      margin-top: 20px;
    }

    /* ── Tables ───────────────────────────────────────── */

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 10px;
    }

    .data-table th {
      background: ${BRAND.navyLight};
      color: ${BRAND.white};
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
    }

    .data-table td {
      padding: 6px 10px;
      border-bottom: 1px solid ${BRAND.greyLight};
    }

    .data-table tr:nth-child(even) td {
      background: ${BRAND.offWhite};
    }

    .data-table .number {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .data-table .unit {
      color: ${BRAND.textMuted};
      font-size: 9px;
    }

    /* ── Macro Cards ──────────────────────────────────── */

    .macro-cards {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
    }

    .macro-card {
      flex: 1;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      border: 1px solid ${BRAND.greyLight};
    }

    .macro-card-value {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.2;
    }

    .macro-card-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${BRAND.textMuted};
      margin-top: 4px;
    }

    .macro-card-unit {
      font-size: 10px;
      color: ${BRAND.textMuted};
    }

    .macro-card.protein { border-top: 3px solid #e53935; }
    .macro-card.fat { border-top: 3px solid #fb8c00; }
    .macro-card.carbs { border-top: 3px solid #43a047; }
    .macro-card.kcal { border-top: 3px solid ${BRAND.navy}; }

    /* ── Day-Type Sections ────────────────────────────── */

    .day-type-header {
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 12px;
      border-left: 4px solid;
    }

    .day-type-training {
      background: ${DAY_TYPE_COLOURS.training.bg};
      border-color: ${DAY_TYPE_COLOURS.training.border};
      color: ${DAY_TYPE_COLOURS.training.text};
    }

    .day-type-rest {
      background: ${DAY_TYPE_COLOURS.rest.bg};
      border-color: ${DAY_TYPE_COLOURS.rest.border};
      color: ${DAY_TYPE_COLOURS.rest.text};
    }

    .day-type-refeed {
      background: ${DAY_TYPE_COLOURS.refeed.bg};
      border-color: ${DAY_TYPE_COLOURS.refeed.border};
      color: ${DAY_TYPE_COLOURS.refeed.text};
    }

    .day-type-deload {
      background: ${DAY_TYPE_COLOURS.deload.bg};
      border-color: ${DAY_TYPE_COLOURS.deload.border};
      color: ${DAY_TYPE_COLOURS.deload.text};
    }

    /* #17 periodization intensity tiers (modes 3-4) */
    .day-type-training_light {
      background: ${DAY_TYPE_COLOURS.training_light.bg};
      border-color: ${DAY_TYPE_COLOURS.training_light.border};
      color: ${DAY_TYPE_COLOURS.training_light.text};
    }

    .day-type-training_medium {
      background: ${DAY_TYPE_COLOURS.training_medium.bg};
      border-color: ${DAY_TYPE_COLOURS.training_medium.border};
      color: ${DAY_TYPE_COLOURS.training_medium.text};
    }

    .day-type-training_intense {
      background: ${DAY_TYPE_COLOURS.training_intense.bg};
      border-color: ${DAY_TYPE_COLOURS.training_intense.border};
      color: ${DAY_TYPE_COLOURS.training_intense.text};
    }

    .day-type-training_double {
      background: ${DAY_TYPE_COLOURS.training_double.bg};
      border-color: ${DAY_TYPE_COLOURS.training_double.border};
      color: ${DAY_TYPE_COLOURS.training_double.text};
    }

    /* ── Body Comp Analysis ───────────────────────────── */

    .body-comp-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .body-comp-stat {
      padding: 10px 14px;
      background: ${BRAND.offWhite};
      border-radius: 6px;
      border-left: 3px solid ${BRAND.gold};
    }

    .body-comp-stat-value {
      font-size: 18px;
      font-weight: 700;
      color: ${BRAND.navy};
    }

    .body-comp-stat-label {
      font-size: 9px;
      color: ${BRAND.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ── TDEE Breakdown ───────────────────────────────── */

    .tdee-bar {
      display: flex;
      height: 24px;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .tdee-bar-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: 600;
      color: ${BRAND.white};
    }

    .tdee-bar-bmr { background: #1565c0; }
    .tdee-bar-neat { background: #2e7d32; }
    .tdee-bar-exercise { background: #e65100; }
    .tdee-bar-tef { background: #7b1fa2; }

    /* ── Meal Plan ────────────────────────────────────── */

    .meal-slot {
      background: ${BRAND.offWhite};
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 10px;
    }

    .meal-slot-header {
      font-weight: 600;
      font-size: 11px;
      color: ${BRAND.navy};
      margin-bottom: 6px;
      text-transform: capitalize;
    }

    .meal-slot-name {
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .meal-slot-macros {
      font-size: 9px;
      color: ${BRAND.textMuted};
    }

    .ingredient-list {
      font-size: 9px;
      color: ${BRAND.textMuted};
      padding-left: 14px;
      margin-top: 4px;
    }

    .ingredient-list li {
      margin-bottom: 2px;
    }

    /* ── Supplements ──────────────────────────────────── */

    .supplement-row {
      display: flex;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid ${BRAND.greyLight};
      font-size: 10px;
    }

    .supplement-name {
      font-weight: 600;
      min-width: 120px;
    }

    .supplement-dosage {
      min-width: 80px;
    }

    .supplement-timing {
      color: ${BRAND.textMuted};
      flex: 1;
    }

    /* ── Guidance ─────────────────────────────────────── */

    .guidance-block {
      background: ${BRAND.offWhite};
      border-left: 3px solid ${BRAND.gold};
      padding: 12px 16px;
      margin-bottom: 12px;
      font-size: 10px;
      line-height: 1.6;
    }

    /* ── Footer ───────────────────────────────────────── */

    .page-footer {
      position: absolute;
      bottom: 10mm;
      left: 18mm;
      right: 18mm;
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: ${BRAND.textMuted};
      border-top: 1px solid ${BRAND.greyLight};
      padding-top: 6px;
    }

    /* ── Utility ──────────────────────────────────────── */

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .mt-4 { margin-top: 16px; }
    .mb-4 { margin-bottom: 16px; }
    .text-muted { color: ${BRAND.textMuted}; }
    .text-small { font-size: 9px; }
  `;
}
