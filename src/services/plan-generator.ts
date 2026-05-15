/**
 * Plan Generation Pipeline
 *
 * Orchestrates the full plan generation flow:
 * 1. Engine calculation (TDEE, macros, hydration per day type)
 * 2. Meal plan creation (per unique day type)
 * 3. Supplement protocol auto-generation
 * 4. Narrative generation (body comp, rationale, monitoring, disclosures)
 * 5. PDF report assembly
 *
 * This is the single entry point for generating a complete nutrition plan.
 */

import type {
  ClientSnapshot,
  DayType,
  BodyComposition,
  WeeklyPlan,
} from "../engine/types";
import { generateWeeklyPlan, estimateBodyFat } from "../engine";
import type { PlanOptions } from "../engine";
import { createMealPlan } from "../engine/meal-plan";
import type {
  MealPlanConfig,
  Allergen,
  MealTag,
  DayMealPlan,
} from "../engine/meal-plan";
import { ALL_TEMPLATES } from "../data/meals";
import type {
  PdfReportData,
  PdfClientInfo,
  DayTypePlanSummary,
  Circonferenze,
  Pliche,
  AnamnestiAllenamento,
  StileVita,
  Obiettivo,
  SupplementEntry,
  GuidanceSection,
  MonitoringConfig,
} from "../pdf/types";
import {
  buildSupplementContext,
  generateSupplementProtocol,
} from "./supplements";
import {
  generateNarratives,
  generateMonitoringConfig,
} from "./narrative";
import type { NarrativeContext } from "./narrative";

// ── Pipeline Input ──────────────────────────────────────────────────────────

/** Complete input for the plan generation pipeline */
export interface PlanGenerationInput {
  /** Client personal info for the PDF cover */
  clientInfo: PdfClientInfo;
  /** Client measurement snapshot */
  snapshot: ClientSnapshot;
  /** Circumference measurements */
  circonferenze?: Circonferenze;
  /** Skinfold measurements */
  pliche?: Pliche;
  /** Training history */
  allenamento?: AnamnestiAllenamento;
  /** Lifestyle habits */
  stileVita?: StileVita;
  /** Client objective */
  obiettivo?: Obiettivo;

  /** Engine calculation options */
  engineOptions?: PlanOptions;
  /** Meal plan configuration overrides */
  mealPlanConfig?: Partial<MealPlanConfig>;
  /** Allergens to exclude from meal plans */
  excludeAllergens?: Allergen[];
  /** Preferred meal tags */
  preferTags?: MealTag[];
  /** Number of meals per day (3-6) */
  mealCount?: number;

  /** Manual supplement overrides (skip auto-generation) */
  supplementOverrides?: SupplementEntry[];
  /** Manual guidance overrides (skip auto-generation) */
  guidanceOverrides?: Partial<GuidanceSection>;
  /** Manual monitoring config */
  monitoringOverride?: MonitoringConfig;

  /** Estimated maintenance kcal (for deficit/surplus detection) */
  maintenanceKcalEstimate?: number;
}

/** Result from the plan generation pipeline */
export interface PlanGenerationResult {
  /** Complete PDF report data — ready for rendering */
  reportData: PdfReportData;
  /** Generated weekly plan (for reference/editing) */
  weeklyPlan: WeeklyPlan;
  /** Body composition result */
  bodyComposition: BodyComposition;
  /** Meal plans per unique day type */
  mealPlans: Map<DayType, DayMealPlan>;
  /** Generated supplement protocol */
  supplements: SupplementEntry[];
  /** Generated guidance narratives */
  guidance: GuidanceSection;
  /** Monitoring configuration */
  monitoring: MonitoringConfig;
  /** Energy balance determination */
  energyBalance: "deficit" | "surplus" | "maintenance";
  /** Assumptions made during generation */
  assumptions: string[];
}

// ── Day Type Labels ─────────────────────────────────────────────────────────

/** Italian labels for day types */
const DAY_TYPE_LABELS: Record<DayType, string> = {
  training: "Giorno di Allenamento",
  rest: "Giorno di Riposo",
  refeed: "Giorno di Refeed",
  deload: "Giorno di Deload",
} as const;

// ── Pipeline Implementation ─────────────────────────────────────────────────

/**
 * Determine energy balance from weekly average vs maintenance estimate.
 */
function determineEnergyBalance(
  weeklyAverageKcal: number,
  maintenanceEstimate: number
): "deficit" | "surplus" | "maintenance" {
  const diff = weeklyAverageKcal - maintenanceEstimate;
  if (Math.abs(diff) <= 50) return "maintenance";
  if (diff < 0) return "deficit";
  return "surplus";
}

/**
 * Collect assumptions made during plan generation.
 */
function collectAssumptions(input: PlanGenerationInput): string[] {
  const assumptions: string[] = [];
  const { snapshot } = input;

  // Body fat method
  if (snapshot.skinfold7) {
    assumptions.push(
      "Grasso corporeo stimato con il metodo Jackson & Pollock 7 pliche (gold standard)."
    );
  } else if (snapshot.skinfold3) {
    assumptions.push(
      "Grasso corporeo stimato con il metodo Jackson & Pollock 3 pliche (buona affidabilità)."
    );
  } else if (snapshot.bodyFatPctOverride) {
    assumptions.push(
      "Grasso corporeo basato su stima visiva/plicometro — precisione limitata (±3-5%)."
    );
  } else {
    assumptions.push(
      "Grasso corporeo stimato con formula euristica basata su BMI — precisione limitata. Si consiglia una plicometria per maggiore accuratezza."
    );
  }

  // Steps
  if (snapshot.dailySteps < 3000) {
    assumptions.push(
      `Il NEAT è calcolato su ${snapshot.dailySteps} passi/giorno — un aumento graduale a 8.000-10.000 passi migliorerebbe significativamente il dispendio energetico.`
    );
  }

  // Exercise method
  const ts = input.engineOptions?.trainingSession;
  if (ts?.method === "met_value" && ts.metValue != null) {
    assumptions.push(
      `Il dispendio dell'esercizio dei giorni di allenamento è stimato con i valori MET delle sessioni inserite (durata media ~${Math.round(
        ts.durationMin
      )} min, MET medio ~${ts.metValue}). I dati di frequenza cardiaca o a zone (Sport Correction Protocol) ne migliorerebbero la precisione.`
    );
  } else if (ts?.method === "heart_rate" || ts?.avgHeartRate != null || ts?.scpData != null) {
    // HR / SCP path — no extra caveat needed here.
  } else {
    assumptions.push(
      "Il dispendio dell'esercizio dei giorni di allenamento usa una stima predefinita (nessuna sessione di allenamento inserita per il cliente). Inserire le sessioni nel profilo migliorerebbe la precisione."
    );
  }

  // Deficit / surplus override from the goal-rate calculator
  const deficit = input.engineOptions?.dailyDeficitKcal;
  if (deficit != null && deficit !== 0) {
    if (deficit > 0) {
      assumptions.push(
        `L'apporto pianificato è impostato con un deficit di ${Math.round(deficit)} kcal/giorno rispetto al TDEE — derivato dall'obiettivo di peso e dalla data target.`
      );
    } else {
      assumptions.push(
        `L'apporto pianificato è impostato con un surplus di ${Math.abs(Math.round(deficit))} kcal/giorno rispetto al TDEE — derivato dall'obiettivo di peso e dalla data target.`
      );
    }
  }

  return assumptions;
}

/**
 * Generate the complete nutrition plan.
 *
 * Orchestrates: engine calculation → meal plans → supplements → narratives → PDF data assembly.
 * Returns both the final PdfReportData and intermediate results for the review UI.
 */
export function generatePlan(
  input: PlanGenerationInput
): PlanGenerationResult {
  const { snapshot, clientInfo } = input;

  // ── Step 1: Body composition ────────────────────────────────────────────
  const bodyFatResult = estimateBodyFat(snapshot);
  const bodyComposition: BodyComposition = bodyFatResult.bodyComposition;

  // ── Step 2: Weekly plan (TDEE + macros + hydration) ────────────────────
  const weeklyPlan = generateWeeklyPlan(snapshot, input.engineOptions);

  // ── Step 3: Meal plans per unique day type ─────────────────────────────
  const uniqueDayTypes = [
    ...new Set(snapshot.weekSchedule),
  ] as DayType[];

  const mealPlans = new Map<DayType, DayMealPlan>();
  for (const dayType of uniqueDayTypes) {
    const dayPlan = weeklyPlan.days.find((d) => d.dayType === dayType);
    if (!dayPlan) continue;

    const config: MealPlanConfig = {
      dayType,
      macroTargets: dayPlan.macros,
      mealCount: input.mealCount ?? input.mealPlanConfig?.mealCount ?? 4,
      excludeAllergens: input.excludeAllergens ?? input.mealPlanConfig?.excludeAllergens,
      preferTags: input.preferTags ?? input.mealPlanConfig?.preferTags,
      tolerances: input.mealPlanConfig?.tolerances,
      substitutionsPerSlot: input.mealPlanConfig?.substitutionsPerSlot,
    };

    const mealPlan = createMealPlan(ALL_TEMPLATES, config);
    mealPlans.set(dayType, mealPlan);
  }

  // ── Step 4: Energy balance ─────────────────────────────────────────────
  // Use weighted weekly average TDEE as maintenance baseline (not just rest-day TDEE)
  const avgTdee = weeklyPlan.days.reduce((sum, d) => sum + d.tdee.totalTdeeKcal, 0) / weeklyPlan.days.length;
  const maintenanceEstimate = input.maintenanceKcalEstimate ?? avgTdee;
  const energyBalance = determineEnergyBalance(weeklyPlan.weeklyAverageKcal, maintenanceEstimate);

  // ── Step 5: Supplement protocol ────────────────────────────────────────
  let supplements: SupplementEntry[];
  if (input.supplementOverrides) {
    supplements = input.supplementOverrides;
  } else {
    const supplementCtx = buildSupplementContext({
      bodyComposition,
      snapshot,
      weeklyAverageKcal: weeklyPlan.weeklyAverageKcal,
      maintenanceKcal: maintenanceEstimate,
      allenamento: input.allenamento,
      stileVita: input.stileVita,
      obiettivo: input.obiettivo,
    });
    supplements = generateSupplementProtocol(supplementCtx);
  }

  // ── Step 6: Assumptions ────────────────────────────────────────────────
  const assumptions = collectAssumptions(input);

  // ── Step 7: Narrative generation ───────────────────────────────────────
  const narrativeCtx: NarrativeContext = {
    snapshot,
    bodyComposition,
    weeklyPlan,
    allenamento: input.allenamento,
    stileVita: input.stileVita,
    obiettivo: input.obiettivo,
    energyBalance,
    assumptions,
  };

  const generatedGuidance = generateNarratives(narrativeCtx);
  const guidance: GuidanceSection = {
    bodyCompAnalysis:
      input.guidanceOverrides?.bodyCompAnalysis ??
      generatedGuidance.bodyCompAnalysis,
    nutritionStrategy:
      input.guidanceOverrides?.nutritionStrategy ??
      generatedGuidance.nutritionStrategy,
    trainingNotes:
      input.guidanceOverrides?.trainingNotes ??
      generatedGuidance.trainingNotes,
    coachNotes:
      input.guidanceOverrides?.coachNotes ??
      generatedGuidance.coachNotes,
  };

  // ── Step 8: Monitoring ─────────────────────────────────────────────────
  const monitoring =
    input.monitoringOverride ?? generateMonitoringConfig(energyBalance);

  // ── Step 9: Assemble PDF report data ───────────────────────────────────
  const dayTypePlans: DayTypePlanSummary[] = uniqueDayTypes.map(
    (dayType) => {
      const dayPlan = weeklyPlan.days.find((d) => d.dayType === dayType);
      if (!dayPlan) {
        throw new Error(`No daily plan found for day type: ${dayType}`);
      }

      return {
        dayType,
        label: DAY_TYPE_LABELS[dayType],
        tdee: dayPlan.tdee,
        macros: dayPlan.macros,
        hydration: dayPlan.hydration,
        mealPlan: mealPlans.get(dayType),
      };
    }
  );

  const reportData: PdfReportData = {
    client: clientInfo,
    snapshot,
    bodyComposition,
    circonferenze: input.circonferenze,
    pliche: input.pliche,
    allenamento: input.allenamento,
    stileVita: input.stileVita,
    obiettivo: input.obiettivo,
    monitoring,
    dayTypePlans,
    supplements,
    guidance,
  };

  return {
    reportData,
    weeklyPlan,
    bodyComposition,
    mealPlans,
    supplements,
    guidance,
    monitoring,
    energyBalance,
    assumptions,
  };
}

// ── Serialization helpers for review UI ─────────────────────────────────────

/** Serializable version of PlanGenerationResult (Map → Record) */
export interface SerializedPlanResult {
  /** Complete PDF report data */
  reportData: PdfReportData;
  /** Weekly plan */
  weeklyPlan: WeeklyPlan;
  /** Body composition */
  bodyComposition: BodyComposition;
  /** Meal plans keyed by day type */
  mealPlans: Record<string, DayMealPlan>;
  /** Supplement protocol */
  supplements: SupplementEntry[];
  /** Guidance narratives */
  guidance: GuidanceSection;
  /** Monitoring config */
  monitoring: MonitoringConfig;
  /** Energy balance */
  energyBalance: "deficit" | "surplus" | "maintenance";
  /** Assumptions */
  assumptions: string[];
}

/**
 * Serialize a PlanGenerationResult for JSON transport (e.g., tRPC response).
 */
export function serializePlanResult(
  result: PlanGenerationResult
): SerializedPlanResult {
  const mealPlans: Record<string, DayMealPlan> = {};
  for (const [key, value] of result.mealPlans) {
    mealPlans[key] = value;
  }

  return {
    reportData: result.reportData,
    weeklyPlan: result.weeklyPlan,
    bodyComposition: result.bodyComposition,
    mealPlans,
    supplements: result.supplements,
    guidance: result.guidance,
    monitoring: result.monitoring,
    energyBalance: result.energyBalance,
    assumptions: result.assumptions,
  };
}

/**
 * Deserialize a SerializedPlanResult back to PlanGenerationResult.
 */
export function deserializePlanResult(
  serialized: SerializedPlanResult
): PlanGenerationResult {
  const mealPlans = new Map<DayType, DayMealPlan>();
  for (const [key, value] of Object.entries(serialized.mealPlans)) {
    mealPlans.set(key as DayType, value);
  }

  return {
    reportData: serialized.reportData,
    weeklyPlan: serialized.weeklyPlan,
    bodyComposition: serialized.bodyComposition,
    mealPlans,
    supplements: serialized.supplements,
    guidance: serialized.guidance,
    monitoring: serialized.monitoring,
    energyBalance: serialized.energyBalance,
    assumptions: serialized.assumptions,
  };
}
