/**
 * HTML template renderer for the branded PDF report.
 * Converts PdfReportData into a complete HTML document for Puppeteer to render.
 */

import type { DayType, TdeeResult, MacroTargets } from "../engine/types";
import type { MealSlot } from "../engine/meal-plan/types";
import type {
  PdfReportData,
  PdfGenerateOptions,
  Circonferenze,
  Pliche,
  DayTypePlanSummary,
  SupplementEntry,
} from "./types";
import { generateCSS, DAY_TYPE_COLOURS } from "./styles";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Escape HTML special characters.
 */
function esc(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Format a number with locale-appropriate thousands separator.
 */
function fmtNum(n: number, decimals = 0): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Get the Italian label for a day type.
 */
function dayTypeLabel(dt: DayType): string {
  return DAY_TYPE_COLOURS[dt].label;
}

/**
 * Get the CSS class for a day-type header.
 */
function dayTypeClass(dt: DayType): string {
  return `day-type-${dt}`;
}

/**
 * Calculate TDEE bar segment widths as percentages.
 */
function tdeeBarSegments(tdee: TdeeResult): { label: string; pct: number; cls: string }[] {
  const total = tdee.bmr.bmrKcal + tdee.neat.totalNeatKcal + tdee.exercise.exerciseKcal + tdee.tef.tefKcal;
  if (total === 0) return [];
  return [
    { label: `BMR ${fmtNum(tdee.bmr.bmrKcal)}`, pct: (tdee.bmr.bmrKcal / total) * 100, cls: "tdee-bar-bmr" },
    { label: `NEAT ${fmtNum(tdee.neat.totalNeatKcal)}`, pct: (tdee.neat.totalNeatKcal / total) * 100, cls: "tdee-bar-neat" },
    { label: `EX ${fmtNum(tdee.exercise.exerciseKcal)}`, pct: (tdee.exercise.exerciseKcal / total) * 100, cls: "tdee-bar-exercise" },
    { label: `TEF ${fmtNum(tdee.tef.tefKcal)}`, pct: (tdee.tef.tefKcal / total) * 100, cls: "tdee-bar-tef" },
  ].filter((s) => s.pct > 0);
}

// ── Section Renderers ───────────────────────────────────────────────────────

/**
 * Render the cover page.
 */
function renderCover(data: PdfReportData): string {
  return `
    <div class="page cover">
      <div class="cover-logo">
        <span class="cover-logo-text">RS</span>
      </div>
      <h1 class="cover-title">Roberto Scrigna</h1>
      <p class="cover-subtitle">Nutrizione Sportiva</p>
      <div class="cover-divider"></div>
      <p class="cover-client">${esc(data.client.fullName)}</p>
      <p class="cover-date">Piano Nutrizionale — ${esc(data.client.planDate)}</p>
      ${data.client.revision ? `<p class="cover-date">Revisione ${data.client.revision}</p>` : ""}
    </div>
  `;
}

/**
 * Render the patient data page.
 */
function renderPaziente(data: PdfReportData): string {
  const s = data.snapshot;
  return `
    <div class="section-header">Dati Paziente</div>
    <table class="data-table">
      <tbody>
        <tr><td>Nome</td><td>${esc(data.client.fullName)}</td></tr>
        ${data.client.dateOfBirth ? `<tr><td>Data di Nascita</td><td>${esc(data.client.dateOfBirth)}</td></tr>` : ""}
        <tr><td>Sesso</td><td>${s.sex === "male" ? "Maschio" : "Femmina"}</td></tr>
        <tr><td>Età</td><td class="number">${s.ageYears} <span class="unit">anni</span></td></tr>
        <tr><td>Peso</td><td class="number">${fmtNum(s.weightKg, 1)} <span class="unit">kg</span></td></tr>
        <tr><td>Altezza</td><td class="number">${fmtNum(s.heightCm, 1)} <span class="unit">cm</span></td></tr>
        <tr><td>Passi Giornalieri</td><td class="number">${fmtNum(s.dailySteps)}</td></tr>
        <tr><td>Livello Occupazionale</td><td>${esc(s.occupationalLevel)}</td></tr>
      </tbody>
    </table>
  `;
}

/**
 * Render circumference measurements.
 */
function renderCirconferenze(circ: Circonferenze): string {
  const entries: [string, number | undefined][] = [
    ["Collo", circ.collo],
    ["Spalle", circ.spalle],
    ["Torace", circ.torace],
    ["Braccio Sx", circ.braccioSx],
    ["Braccio Dx", circ.braccioDx],
    ["Avambraccio Dx", circ.avambraccioDx],
    ["Avambraccio Sx", circ.avambraccioSx],
    ["Vita", circ.vita],
    ["Fianchi", circ.fianchi],
    ["Coscia Dx", circ.cosciaDx],
    ["Coscia Sx", circ.cosciaSx],
    ["Polpaccio Dx", circ.polpaccioDx],
    ["Polpaccio Sx", circ.polpaccioSx],
  ];

  const rows = entries
    .filter(([, v]) => v != null)
    .map(([label, v]) => `<tr><td>${esc(label)}</td><td class="number">${fmtNum(v!, 1)} <span class="unit">cm</span></td></tr>`)
    .join("\n");

  return `
    <div class="section-header">Circonferenze</div>
    <table class="data-table">
      <thead><tr><th>Misura</th><th class="number">Valore</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Render skinfold measurements.
 */
function renderPliche(pliche: Pliche): string {
  const entries: [string, number | undefined][] = [
    ["Pettorale", pliche.pettorale],
    ["Ascellare", pliche.ascellare],
    ["Tricipite", pliche.tricipite],
    ["Sottoscapolare", pliche.sottoscapolare],
    ["Addominale", pliche.addominale],
    ["Sovrailiaca", pliche.sovrailiaca],
    ["Coscia", pliche.coscia],
  ];

  const rows = entries
    .filter(([, v]) => v != null)
    .map(([label, v]) => `<tr><td>${esc(label)}</td><td class="number">${fmtNum(v!, 1)} <span class="unit">mm</span></td></tr>`)
    .join("\n");

  return `
    <div class="section-header">Pliche</div>
    <table class="data-table">
      <thead><tr><th>Plica</th><th class="number">Valore</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Render training history section.
 */
function renderAllenamento(data: PdfReportData): string {
  if (!data.allenamento) return "";
  const a = data.allenamento;
  return `
    <div class="section-header">Anamnesi Allenamento</div>
    <table class="data-table">
      <tbody>
        <tr><td>Frequenza</td><td>${a.frequencyPerWeek}x / settimana</td></tr>
        <tr><td>Modalità</td><td>${a.modalities.map(esc).join(", ")}</td></tr>
        <tr><td>Esperienza</td><td>${a.experienceYears} anni</td></tr>
        ${a.currentProgramme ? `<tr><td>Programma Attuale</td><td>${esc(a.currentProgramme)}</td></tr>` : ""}
        ${a.limitations?.length ? `<tr><td>Limitazioni</td><td>${a.limitations.map(esc).join(", ")}</td></tr>` : ""}
      </tbody>
    </table>
  `;
}

/**
 * Render lifestyle section.
 */
function renderStileVita(data: PdfReportData): string {
  if (!data.stileVita) return "";
  const sv = data.stileVita;
  return `
    <div class="section-header">Stile di Vita</div>
    <table class="data-table">
      <tbody>
        <tr><td>Occupazione</td><td>${esc(sv.occupation)}</td></tr>
        <tr><td>Sonno</td><td>${sv.sleepHours} ore / notte</td></tr>
        ${sv.currentDiet ? `<tr><td>Dieta Attuale</td><td>${esc(sv.currentDiet)}</td></tr>` : ""}
        ${sv.allergies?.length ? `<tr><td>Allergie</td><td>${sv.allergies.map(esc).join(", ")}</td></tr>` : ""}
        ${sv.stressLevel != null ? `<tr><td>Livello Stress</td><td>${sv.stressLevel}/10</td></tr>` : ""}
      </tbody>
    </table>
  `;
}

/**
 * Render objective section.
 */
function renderObiettivo(data: PdfReportData): string {
  if (!data.obiettivo) return "";
  const o = data.obiettivo;
  return `
    <div class="section-header">Obiettivo</div>
    <table class="data-table">
      <tbody>
        <tr><td>Obiettivo Primario</td><td>${esc(o.primaryGoal)}</td></tr>
        ${o.targetWeightKg != null ? `<tr><td>Peso Target</td><td class="number">${fmtNum(o.targetWeightKg, 1)} <span class="unit">kg</span></td></tr>` : ""}
        ${o.targetBodyFatPct != null ? `<tr><td>BF% Target</td><td class="number">${fmtNum(o.targetBodyFatPct, 1)}%</td></tr>` : ""}
        ${o.timelineWeeks != null ? `<tr><td>Timeline</td><td>${o.timelineWeeks} settimane</td></tr>` : ""}
        ${o.notes ? `<tr><td>Note</td><td>${esc(o.notes)}</td></tr>` : ""}
      </tbody>
    </table>
  `;
}

/**
 * Render body composition analysis section.
 */
function renderBodyCompAnalysis(data: PdfReportData): string {
  const bc = data.bodyComposition;
  return `
    <div class="section-header">Analisi Composizione Corporea</div>
    <div class="body-comp-grid">
      <div class="body-comp-stat">
        <div class="body-comp-stat-value">${fmtNum(bc.bodyFatPct, 1)}%</div>
        <div class="body-comp-stat-label">Massa Grassa</div>
      </div>
      <div class="body-comp-stat">
        <div class="body-comp-stat-value">${fmtNum(bc.leanMassKg, 1)} kg</div>
        <div class="body-comp-stat-label">Massa Magra</div>
      </div>
      <div class="body-comp-stat">
        <div class="body-comp-stat-value">${fmtNum(bc.fatMassKg, 1)} kg</div>
        <div class="body-comp-stat-label">Massa Grassa (kg)</div>
      </div>
      <div class="body-comp-stat">
        <div class="body-comp-stat-value">${fmtNum(data.snapshot.weightKg, 1)} kg</div>
        <div class="body-comp-stat-label">Peso Totale</div>
      </div>
    </div>
  `;
}

/**
 * Render monitoring configuration section.
 */
function renderMonitoring(data: PdfReportData): string {
  if (!data.monitoring) return "";
  const m = data.monitoring;
  return `
    <div class="section-header">Monitoraggio</div>
    <table class="data-table">
      <tbody>
        <tr><td>Frequenza Check-in</td><td>Ogni ${m.checkInFrequencyDays} giorni</td></tr>
        <tr><td>Metriche</td><td>${m.metrics.map(esc).join(", ")}</td></tr>
        ${m.reassessmentNotes ? `<tr><td>Criteri Rivalutazione</td><td>${esc(m.reassessmentNotes)}</td></tr>` : ""}
      </tbody>
    </table>
  `;
}

/**
 * Render macro cards for a day type.
 */
function renderMacroCards(macros: MacroTargets): string {
  return `
    <div class="macro-cards">
      <div class="macro-card kcal">
        <div class="macro-card-value">${fmtNum(macros.totalKcal)}</div>
        <div class="macro-card-unit">kcal</div>
        <div class="macro-card-label">Energia</div>
      </div>
      <div class="macro-card protein">
        <div class="macro-card-value">${fmtNum(macros.proteinG)}</div>
        <div class="macro-card-unit">g</div>
        <div class="macro-card-label">Proteine</div>
      </div>
      <div class="macro-card fat">
        <div class="macro-card-value">${fmtNum(macros.fatG)}</div>
        <div class="macro-card-unit">g</div>
        <div class="macro-card-label">Grassi</div>
      </div>
      <div class="macro-card carbs">
        <div class="macro-card-value">${fmtNum(macros.carbG)}</div>
        <div class="macro-card-unit">g</div>
        <div class="macro-card-label">Carboidrati</div>
      </div>
    </div>
  `;
}

/**
 * Render TDEE breakdown bar.
 */
function renderTdeeBar(tdee: TdeeResult): string {
  const segments = tdeeBarSegments(tdee);
  const bars = segments
    .map((s) => `<div class="tdee-bar-segment ${s.cls}" style="width: ${s.pct.toFixed(1)}%">${s.label}</div>`)
    .join("\n");

  return `
    <div class="subsection-header">TDEE: ${fmtNum(tdee.totalTdeeKcal)} kcal</div>
    <div class="tdee-bar">${bars}</div>
  `;
}

/**
 * Render meal slots for a day-type meal plan.
 */
function renderMealSlots(slots: MealSlot[]): string {
  return slots
    .map((slot) => {
      const m = slot.primary;
      const ingredients = m.scaledIngredients
        .map((i) => `<li>${esc(i.name)} — ${fmtNum(i.grams, 0)}g</li>`)
        .join("\n");

      return `
        <div class="meal-slot">
          <div class="meal-slot-header">${esc(slot.slot)}</div>
          <div class="meal-slot-name">${esc(m.template.name)}</div>
          <div class="meal-slot-macros">
            ${fmtNum(m.actualMacros.kcal)} kcal · P ${fmtNum(m.actualMacros.proteinG)}g · F ${fmtNum(m.actualMacros.fatG)}g · C ${fmtNum(m.actualMacros.carbsG)}g
          </div>
          <ul class="ingredient-list">${ingredients}</ul>
        </div>
      `;
    })
    .join("\n");
}

/**
 * Render the macro comparison table for all day types.
 */
function renderMacroTable(plans: DayTypePlanSummary[]): string {
  const rows = plans
    .map((p) => {
      const colours = DAY_TYPE_COLOURS[p.dayType];
      return `
        <tr>
          <td style="color: ${colours.text}; font-weight: 600">${esc(p.label)}</td>
          <td class="number">${fmtNum(p.macros.totalKcal)}</td>
          <td class="number">${fmtNum(p.macros.proteinG)}</td>
          <td class="number">${fmtNum(p.macros.fatG)}</td>
          <td class="number">${fmtNum(p.macros.carbG)}</td>
          <td class="number">${fmtNum(p.hydration.waterMl)}</td>
        </tr>
      `;
    })
    .join("\n");

  return `
    <div class="section-header">Riepilogo Macro per Tipologia Giorno</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Tipo Giorno</th>
          <th class="number">kcal</th>
          <th class="number">Proteine (g)</th>
          <th class="number">Grassi (g)</th>
          <th class="number">Carb (g)</th>
          <th class="number">Acqua (ml)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Render a single day-type plan section.
 */
function renderDayTypePlan(plan: DayTypePlanSummary, includeMealPlans: boolean): string {
  return `
    <div class="day-type-header ${dayTypeClass(plan.dayType)}">
      ${dayTypeLabel(plan.dayType)} — ${esc(plan.label)}
    </div>
    ${renderTdeeBar(plan.tdee)}
    ${renderMacroCards(plan.macros)}
    ${includeMealPlans && plan.mealPlan ? renderMealSlots(plan.mealPlan.slots) : ""}
  `;
}

/**
 * Render supplement protocol.
 */
function renderSupplements(supplements: SupplementEntry[]): string {
  if (!supplements.length) return "";
  const rows = supplements
    .map(
      (s) => `
      <div class="supplement-row">
        <span class="supplement-name">${esc(s.name)}</span>
        <span class="supplement-dosage">${esc(s.dosage)}</span>
        <span class="supplement-timing">${esc(s.timing)}</span>
      </div>
    `
    )
    .join("\n");

  return `
    <div class="section-header">Protocollo Integratori</div>
    ${rows}
  `;
}

/**
 * Render guidance narratives.
 */
function renderGuidance(data: PdfReportData): string {
  if (!data.guidance) return "";
  const g = data.guidance;
  return `
    <div class="section-header">Indicazioni</div>
    <div class="subsection-header">Analisi Composizione Corporea</div>
    <div class="guidance-block">${esc(g.bodyCompAnalysis)}</div>
    <div class="subsection-header">Strategia Nutrizionale</div>
    <div class="guidance-block">${esc(g.nutritionStrategy)}</div>
    ${g.trainingNotes ? `<div class="subsection-header">Note Allenamento</div><div class="guidance-block">${esc(g.trainingNotes)}</div>` : ""}
    ${g.coachNotes ? `<div class="subsection-header">Note del Coach</div><div class="guidance-block">${esc(g.coachNotes)}</div>` : ""}
  `;
}

/**
 * Render the page footer.
 */
function renderFooter(data: PdfReportData, pageNum: number, footerText?: string): string {
  return `
    <div class="page-footer">
      <span>${footerText ?? "Roberto Scrigna — Nutrizione Sportiva"}</span>
      <span>${esc(data.client.fullName)} — ${esc(data.client.planDate)}</span>
      <span>Pag. ${pageNum}</span>
    </div>
  `;
}

// ── Main Renderer ───────────────────────────────────────────────────────────

/**
 * Render a complete HTML document from report data.
 * This HTML is designed to be rendered by Puppeteer into a branded PDF.
 *
 * @param data - Complete report data
 * @param options - PDF generation options
 * @returns Complete HTML string ready for Puppeteer rendering
 */
export function renderReportHtml(
  data: PdfReportData,
  options: PdfGenerateOptions = {}
): string {
  const includeMealPlans = options.includeMealPlans !== false;
  const includeSupplements = options.includeSupplements !== false;
  const includeGuidance = options.includeGuidance !== false;

  // Page 1: Cover
  const coverPage = renderCover(data);

  // Page 2: Patient data + measurements
  let page2 = `<div class="page">`;
  page2 += renderPaziente(data);
  if (data.circonferenze) page2 += renderCirconferenze(data.circonferenze);
  if (data.pliche) page2 += renderPliche(data.pliche);
  page2 += renderFooter(data, 2, options.footerText);
  page2 += `</div>`;

  // Page 3: Anamnesi + lifestyle + objective
  let page3 = `<div class="page">`;
  page3 += renderAllenamento(data);
  page3 += renderStileVita(data);
  page3 += renderObiettivo(data);
  page3 += renderFooter(data, 3, options.footerText);
  page3 += `</div>`;

  // Page 4: Body comp analysis + monitoring
  let page4 = `<div class="page">`;
  page4 += renderBodyCompAnalysis(data);
  page4 += renderMonitoring(data);
  page4 += renderMacroTable(data.dayTypePlans);
  page4 += renderFooter(data, 4, options.footerText);
  page4 += `</div>`;

  // Day-type plan pages (one per day type)
  const dayTypePages = data.dayTypePlans.map((plan, i) => {
    let page = `<div class="page">`;
    page += renderDayTypePlan(plan, includeMealPlans);
    page += renderFooter(data, 5 + i, options.footerText);
    page += `</div>`;
    return page;
  });

  // Supplements page
  let supplementsPage = "";
  if (includeSupplements && data.supplements?.length) {
    supplementsPage = `<div class="page">`;
    supplementsPage += renderSupplements(data.supplements);
    supplementsPage += renderFooter(data, 5 + data.dayTypePlans.length, options.footerText);
    supplementsPage += `</div>`;
  }

  // Guidance page
  let guidancePage = "";
  if (includeGuidance && data.guidance) {
    const pageNum = 5 + data.dayTypePlans.length + (supplementsPage ? 1 : 0);
    guidancePage = `<div class="page">`;
    guidancePage += renderGuidance(data);
    guidancePage += renderFooter(data, pageNum, options.footerText);
    guidancePage += `</div>`;
  }

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Piano Nutrizionale — ${esc(data.client.fullName)}</title>
  <style>${generateCSS()}</style>
</head>
<body>
  ${coverPage}
  ${page2}
  ${page3}
  ${page4}
  ${dayTypePages.join("\n")}
  ${supplementsPage}
  ${guidancePage}
</body>
</html>`;
}
