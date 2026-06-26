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
import { generateWeeklyPlan, estimateBodyFat, waterLoadingSchedule } from "../engine";
import type { PlanOptions, WaterLoadingSchedule } from "../engine";
import { createMealPlan } from "../engine/meal-plan";
import {
  FIBRE_RESTRICTION_CAP_G,
  SODIUM_RESTRICTION_CAP_MG,
} from "../engine/meal-plan";
import type {
  MealPlanConfig,
  Allergen,
  MealTag,
  DayMealPlan,
  SourcePin,
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

  /** Combat-sport protocols (#11) — OFF by default, combinable for fight week. */
  protocols?: CombatProtocols;
  /**
   * Coach source pins (#16b) per day-type — force which food fills a category.
   * Opt-in; absent = free selection (unchanged). Threaded into the solver.
   */
  sourcePins?: Partial<Record<DayType, SourcePin>>;
}

/**
 * Selectable combat-sport plan protocols (#11). All OFF by default and
 * combinable (e.g. fibre + sodium restriction together for fight week). The
 * restriction caps are layered as JOINT constraints on the solved meal plan
 * (kcal + protein stay protected); water loading is a separate fluid schedule.
 */
export interface CombatProtocols {
  /** Cap day fibre below the restriction cap (≈9 g/day) instead of the floor. */
  fibreRestriction?: boolean;
  /** Cap day sodium below the restriction cap (≈500 mg/day). */
  sodiumRestriction?: boolean;
  /** Produce a multi-day water-loading fluid schedule (3 load days + taper). */
  waterLoading?: boolean;
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
  /** Water-loading fluid schedule when the protocol is on (#11). */
  waterLoading?: WaterLoadingSchedule;
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

  // Per-day training override (Struttura del piano wizard) — provenance so
  // the review page shows the activity wasn't the intake average.
  const perDay = input.engineOptions?.perDayTrainingSession;
  if (perDay && perDay.some((s) => s != null)) {
    const n = perDay.filter((s) => s != null).length;
    assumptions.push(
      `L'attività è stata impostata manualmente per ${n} ${
        n === 1 ? "giorno" : "giorni"
      } della settimana (anziché usare la media delle sessioni di intake).`
    );
  }

  // Absolute macro overrides (Macro per giorno wizard) — make manual pins
  // visible on the review page rather than passing silently.
  const macroOv = input.engineOptions?.macroOptions?.absoluteOverrides;
  if (macroOv) {
    const dayTypeIt: Record<string, string> = {
      training: "allenamento",
      rest: "riposo",
      refeed: "ricarica",
      deload: "scarico",
    };
    const pinned: string[] = [];
    for (const [dt, ov] of Object.entries(macroOv)) {
      if (!ov) continue;
      const parts: string[] = [];
      if (ov.proteinG != null) parts.push(`P ${ov.proteinG}g`);
      if (ov.fatG != null) parts.push(`G ${ov.fatG}g`);
      if (ov.carbG != null) parts.push(`C ${ov.carbG}g`);
      if (parts.length > 0) {
        pinned.push(`${dayTypeIt[dt] ?? dt} (${parts.join(" · ")})`);
      }
    }
    if (pinned.length > 0) {
      assumptions.push(
        `Macro impostate manualmente su: ${pinned.join("; ")} — gli altri valori seguono le formule automatiche.`
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
      fibreTargetPer1000: input.mealPlanConfig?.fibreTargetPer1000,
      // #11 restriction protocols → JOINT solver/reconcile constraints.
      ...(input.protocols?.fibreRestriction
        ? { fibreMode: "cap" as const, fibreCapG: FIBRE_RESTRICTION_CAP_G }
        : {}),
      ...(input.protocols?.sodiumRestriction
        ? { sodiumCapMg: SODIUM_RESTRICTION_CAP_MG }
        : {}),
      // #16b: coach source pins (per day-type); planner resolves config.dayType.
      ...(input.sourcePins ? { sourcePins: input.sourcePins } : {}),
    };

    const mealPlan = createMealPlan(ALL_TEMPLATES, config);
    mealPlans.set(dayType, mealPlan);
  }

  // ── Water loading (#11) — a fluid schedule, not a macro change ──────────
  const waterLoading: WaterLoadingSchedule | undefined = input.protocols?.waterLoading
    ? waterLoadingSchedule(snapshot.weightKg)
    : undefined;

  // ── Step 4: Energy balance ─────────────────────────────────────────────
  // Use weighted weekly average TDEE as maintenance baseline (not just rest-day TDEE)
  const avgTdee = weeklyPlan.days.reduce((sum, d) => sum + d.tdee.totalTdeeKcal, 0) / weeklyPlan.days.length;
  const maintenanceEstimate = input.maintenanceKcalEstimate ?? avgTdee;
  const energyBalance = determineEnergyBalance(weeklyPlan.weeklyAverageKcal, maintenanceEstimate);

  // ── Step 5: Supplement protocol ────────────────────────────────────────
  // #23: NEW plans seed ZERO supplements (Roberto's explicit default — no auto-
  // assignment). The coach curates supplements from the static library and they
  // live in the plan bundle. The opt-in `supplementOverrides` path is preserved;
  // generateSupplementProtocol/checkSupplementInteractions remain in the service
  // for that path and future use.
  const supplements: SupplementEntry[] = input.supplementOverrides ?? [];

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
    ...(waterLoading ? { waterLoading } : {}),
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
