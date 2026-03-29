/**
 * Supplement Protocol System
 *
 * Master library of supplements with conditional inclusion logic.
 * Auto-generates a client-specific supplement protocol based on:
 * - Body composition (body fat %, lean mass)
 * - Training profile (frequency, day types, goals)
 * - Lifestyle factors (sleep, stress, diet)
 * - Objective (cut, bulk, recomp, health)
 */

import type { BodyComposition, DayType, ClientSnapshot } from "../engine/types";
import type {
  Obiettivo,
  StileVita,
  AnamnestiAllenamento,
  SupplementEntry,
} from "../pdf/types";

// ── Inclusion Condition Types ───────────────────────────────────────────────

/** Context available for evaluating inclusion conditions */
export interface SupplementContext {
  /** Client body composition */
  bodyComposition: BodyComposition;
  /** Client snapshot (measurements, schedule) */
  snapshot: ClientSnapshot;
  /** Training info */
  allenamento?: AnamnestiAllenamento;
  /** Lifestyle info */
  stileVita?: StileVita;
  /** Client objective */
  obiettivo?: Obiettivo;
  /** Day types in the week schedule */
  dayTypes: DayType[];
  /** Number of training days per week */
  trainingDaysPerWeek: number;
  /** Whether client is in a caloric deficit */
  isDeficit: boolean;
  /** Whether client is in a caloric surplus */
  isSurplus: boolean;
}

/** A supplement in the master library with inclusion condition */
export interface MasterSupplement {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Recommended daily dosage */
  dosage: string;
  /** Timing instructions */
  timing: string;
  /** Clinical rationale */
  rationale: string;
  /** Category for grouping */
  category: SupplementCategory;
  /** Priority (1 = essential, 2 = recommended, 3 = optional) */
  priority: 1 | 2 | 3;
  /** Condition function — returns true if supplement should be included */
  condition: (ctx: SupplementContext) => boolean;
}

/** Supplement categories */
export type SupplementCategory =
  | "foundation"
  | "performance"
  | "recovery"
  | "body_composition"
  | "health"
  | "sleep";

// ── Master Supplement Library ───────────────────────────────────────────────

/** Complete master library of supplements with inclusion conditions */
export const MASTER_SUPPLEMENTS: readonly MasterSupplement[] = [
  // ── Foundation (always included) ──────────────────────────────────────
  {
    id: "whey_protein",
    name: "Proteine Whey Isolate",
    dosage: "25-30g per porzione",
    timing: "Post-allenamento o tra i pasti per raggiungere il target proteico",
    rationale:
      "Fonte proteica ad alto valore biologico per supportare la sintesi proteica muscolare e raggiungere il fabbisogno giornaliero.",
    category: "foundation",
    priority: 1,
    condition: () => true,
  },
  {
    id: "multivitamin",
    name: "Multivitaminico completo",
    dosage: "1 compressa/die",
    timing: "A colazione con il pasto",
    rationale:
      "Copertura di micronutrienti essenziali, soprattutto in regime ipocalorico dove l'apporto alimentare potrebbe essere limitato.",
    category: "foundation",
    priority: 1,
    condition: () => true,
  },
  {
    id: "omega3",
    name: "Omega-3 (EPA/DHA)",
    dosage: "2-3g EPA+DHA/die",
    timing: "Con i pasti principali (diviso in 2-3 assunzioni)",
    rationale:
      "Effetto antinfiammatorio, supporto cardiovascolare, miglioramento della sensibilità insulinica e del recupero muscolare.",
    category: "foundation",
    priority: 1,
    condition: () => true,
  },
  {
    id: "vitamin_d3",
    name: "Vitamina D3",
    dosage: "2000-4000 UI/die",
    timing: "Con un pasto contenente grassi",
    rationale:
      "Essenziale per la salute ossea, la funzione immunitaria e il mantenimento dei livelli di testosterone.",
    category: "foundation",
    priority: 1,
    condition: () => true,
  },

  // ── Performance (training-dependent) ──────────────────────────────────
  {
    id: "creatine",
    name: "Creatina monoidrato",
    dosage: "5g/die",
    timing: "Post-allenamento o in qualsiasi momento della giornata",
    rationale:
      "Aumenta le riserve di fosfocreatina, migliorando la performance in esercizi ad alta intensità e supportando l'ipertrofia muscolare.",
    category: "performance",
    priority: 1,
    condition: (ctx) => ctx.trainingDaysPerWeek >= 3,
  },
  {
    id: "caffeine",
    name: "Caffeina",
    dosage: "200-400mg",
    timing: "30-60 minuti pre-allenamento",
    rationale:
      "Migliora la concentrazione, riduce la percezione della fatica e aumenta la performance durante l'allenamento.",
    category: "performance",
    priority: 2,
    condition: (ctx) => ctx.trainingDaysPerWeek >= 3,
  },
  {
    id: "citrulline",
    name: "Citrullina malato",
    dosage: "6-8g",
    timing: "30 minuti pre-allenamento",
    rationale:
      "Precursore dell'arginina, migliora il flusso ematico, riduce l'affaticamento e aumenta il volume di allenamento.",
    category: "performance",
    priority: 2,
    condition: (ctx) => ctx.trainingDaysPerWeek >= 4,
  },
  {
    id: "beta_alanine",
    name: "Beta-alanina",
    dosage: "3.2-6.4g/die",
    timing: "Diviso in 2 assunzioni (mattina e pre-allenamento)",
    rationale:
      "Aumenta i livelli di carnosina muscolare, migliorando la resistenza in serie da 60-240 secondi.",
    category: "performance",
    priority: 3,
    condition: (ctx) =>
      ctx.trainingDaysPerWeek >= 4 &&
      (ctx.allenamento?.experienceYears ?? 0) >= 2,
  },

  // ── Recovery ──────────────────────────────────────────────────────────
  {
    id: "magnesium",
    name: "Magnesio (bisglicinato)",
    dosage: "400mg/die",
    timing: "Prima di dormire",
    rationale:
      "Supporta il rilassamento muscolare, la qualità del sonno e oltre 300 reazioni enzimatiche. Il bisglicinato ha la migliore biodisponibilità.",
    category: "recovery",
    priority: 1,
    condition: (ctx) => ctx.trainingDaysPerWeek >= 3,
  },
  {
    id: "zinc",
    name: "Zinco",
    dosage: "15-30mg/die",
    timing: "Prima di dormire (lontano da pasti ricchi di fitati)",
    rationale:
      "Supporta la funzione immunitaria, la produzione di testosterone e il recupero. Importante in caso di sudorazione abbondante.",
    category: "recovery",
    priority: 2,
    condition: (ctx) =>
      ctx.trainingDaysPerWeek >= 4 || ctx.snapshot.sex === "male",
  },
  {
    id: "glutamine",
    name: "L-Glutammina",
    dosage: "5-10g/die",
    timing: "Post-allenamento e prima di dormire",
    rationale:
      "Supporta la funzione immunitaria e il recupero intestinale, particolarmente utile in periodi di allenamento intenso o deficit calorico.",
    category: "recovery",
    priority: 3,
    condition: (ctx) => ctx.isDeficit && ctx.trainingDaysPerWeek >= 4,
  },

  // ── Body Composition ──────────────────────────────────────────────────
  {
    id: "cla",
    name: "CLA (Acido Linoleico Coniugato)",
    dosage: "3-4g/die",
    timing: "Con i pasti principali",
    rationale:
      "Può supportare la riduzione del grasso corporeo e il mantenimento della massa magra durante il deficit calorico.",
    category: "body_composition",
    priority: 3,
    condition: (ctx) =>
      ctx.isDeficit && ctx.bodyComposition.bodyFatPct > 18,
  },
  {
    id: "carnitine",
    name: "L-Carnitina",
    dosage: "2g/die",
    timing: "Pre-allenamento con una fonte di carboidrati",
    rationale:
      "Facilita il trasporto degli acidi grassi nei mitocondri per l'ossidazione. Più efficace in soggetti con BF% elevato.",
    category: "body_composition",
    priority: 2,
    condition: (ctx) =>
      ctx.isDeficit && ctx.bodyComposition.bodyFatPct > 15,
  },
  {
    id: "fiber_supplement",
    name: "Integratore di fibre (psyllium)",
    dosage: "5-10g/die",
    timing: "Con abbondante acqua, prima dei pasti principali",
    rationale:
      "Migliora la sazietà e la regolarità intestinale, particolarmente utile in diete ipocaloriche con volumi alimentari ridotti.",
    category: "body_composition",
    priority: 2,
    condition: (ctx) => ctx.isDeficit,
  },

  // ── Health ────────────────────────────────────────────────────────────
  {
    id: "probiotics",
    name: "Probiotici",
    dosage: "10-20 miliardi CFU/die",
    timing: "A stomaco vuoto (mattina o prima di dormire)",
    rationale:
      "Supporta la salute intestinale, la funzione immunitaria e l'assorbimento dei nutrienti.",
    category: "health",
    priority: 2,
    condition: (ctx) =>
      (ctx.stileVita?.stressLevel ?? 0) >= 6 ||
      ctx.isDeficit,
  },
  {
    id: "vitamin_c",
    name: "Vitamina C",
    dosage: "500-1000mg/die",
    timing: "Con la colazione",
    rationale:
      "Antiossidante, supporta la funzione immunitaria e la sintesi del collagene. Importante in periodi di stress e allenamento intenso.",
    category: "health",
    priority: 2,
    condition: (ctx) =>
      ctx.trainingDaysPerWeek >= 5 ||
      (ctx.stileVita?.stressLevel ?? 0) >= 7,
  },

  // ── Sleep ─────────────────────────────────────────────────────────────
  {
    id: "melatonin",
    name: "Melatonina",
    dosage: "0.5-3mg",
    timing: "30-60 minuti prima di dormire",
    rationale:
      "Regola il ritmo circadiano e migliora la qualità del sonno. Dosaggio minimo efficace consigliato.",
    category: "sleep",
    priority: 3,
    condition: (ctx) =>
      (ctx.stileVita?.sleepHours ?? 8) < 7 ||
      (ctx.stileVita?.stressLevel ?? 0) >= 7,
  },
  {
    id: "ashwagandha",
    name: "Ashwagandha (KSM-66)",
    dosage: "600mg/die",
    timing: "Con la cena o prima di dormire",
    rationale:
      "Adattogeno che riduce il cortisolo, migliora la qualità del sonno e supporta il recupero dallo stress cronico.",
    category: "sleep",
    priority: 2,
    condition: (ctx) =>
      (ctx.stileVita?.stressLevel ?? 0) >= 6 &&
      ctx.trainingDaysPerWeek >= 3,
  },
] as const;

// ── Protocol Generation ─────────────────────────────────────────────────────

/**
 * Build supplement context from available client data.
 */
export function buildSupplementContext(params: {
  bodyComposition: BodyComposition;
  snapshot: ClientSnapshot;
  weeklyAverageKcal: number;
  maintenanceKcal: number;
  allenamento?: AnamnestiAllenamento;
  stileVita?: StileVita;
  obiettivo?: Obiettivo;
}): SupplementContext {
  const dayTypes = [...params.snapshot.weekSchedule];
  const trainingDaysPerWeek = dayTypes.filter(
    (d) => d === "training"
  ).length;

  const deficit = params.weeklyAverageKcal < params.maintenanceKcal * 0.95;
  const surplus = params.weeklyAverageKcal > params.maintenanceKcal * 1.05;

  return {
    bodyComposition: params.bodyComposition,
    snapshot: params.snapshot,
    allenamento: params.allenamento,
    stileVita: params.stileVita,
    obiettivo: params.obiettivo,
    dayTypes,
    trainingDaysPerWeek,
    isDeficit: deficit,
    isSurplus: surplus,
  };
}

/**
 * Generate a client-specific supplement protocol.
 *
 * Evaluates each supplement's inclusion condition against the client context,
 * filters to applicable supplements, and returns them sorted by priority then category.
 */
export function generateSupplementProtocol(
  ctx: SupplementContext
): SupplementEntry[] {
  const applicable = MASTER_SUPPLEMENTS.filter((s) => s.condition(ctx));

  // Sort by priority (1 first), then by category order
  const categoryOrder: Record<SupplementCategory, number> = {
    foundation: 0,
    performance: 1,
    recovery: 2,
    body_composition: 3,
    health: 4,
    sleep: 5,
  };

  const sorted = [...applicable].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return categoryOrder[a.category] - categoryOrder[b.category];
  });

  return sorted.map((s) => ({
    name: s.name,
    dosage: s.dosage,
    timing: s.timing,
    rationale: s.rationale,
  }));
}

/**
 * Get the full master library for display/editing purposes.
 */
export function getMasterSupplements(): readonly MasterSupplement[] {
  return MASTER_SUPPLEMENTS;
}
