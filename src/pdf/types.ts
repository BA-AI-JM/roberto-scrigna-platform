/**
 * Types for the branded PDF report generator.
 * Represents a complete nutrition plan report for a Roberto Scrigna client.
 */

import type {
  DayType,
  ClientSnapshot,
  BodyComposition,
  TdeeResult,
  MacroTargets,
  HydrationTargets,
} from "../engine/types";
import type { DayMealPlan } from "../engine/meal-plan/types";

// ── Client Personal Data ────────────────────────────────────────────────────

/** Client personal information for the cover page */
export interface PdfClientInfo {
  /** Full name */
  fullName: string;
  /** Date of birth (YYYY-MM-DD) */
  dateOfBirth?: string;
  /** Contact email */
  email?: string;
  /** Contact phone */
  phone?: string;
  /** Date the plan was generated (YYYY-MM-DD) */
  planDate: string;
  /** Plan revision number */
  revision?: number;
}

// ── Body Measurements ───────────────────────────────────────────────────────

/** Circumference measurements in cm */
export interface Circonferenze {
  collo?: number;
  spalle?: number;
  torace?: number;
  braccioSx?: number;
  braccioDx?: number;
  avambraccioDx?: number;
  avambraccioSx?: number;
  vita?: number;
  fianchi?: number;
  cosciaDx?: number;
  cosciaSx?: number;
  polpaccioDx?: number;
  polpaccioSx?: number;
}

/** Skinfold (plica) measurements in mm */
export interface Pliche {
  pettorale?: number;
  ascellare?: number;
  tricipite?: number;
  sottoscapolare?: number;
  addominale?: number;
  sovrailiaca?: number;
  coscia?: number;
}

// ── Anamnesi & Lifestyle ────────────────────────────────────────────────────

/** Training history and current regimen */
export interface AnamnestiAllenamento {
  /** Current training frequency (sessions/week) */
  frequencyPerWeek: number;
  /** Primary training modalities */
  modalities: string[];
  /** Training experience in years */
  experienceYears: number;
  /** Current split or programme name */
  currentProgramme?: string;
  /** Any injuries or limitations */
  limitations?: string[];
}

/** Lifestyle and dietary habits */
export interface StileVita {
  /** Occupation description */
  occupation: string;
  /** Average sleep hours */
  sleepHours: number;
  /** Current dietary approach/habits */
  currentDiet?: string;
  /** Supplements currently taken */
  currentSupplements?: string[];
  /** Known food allergies or intolerances */
  allergies?: string[];
  /** Stress level (1-10) */
  stressLevel?: number;
}

// ── Objective & Monitoring ──────────────────────────────────────────────────

/** Client objective and goal */
export interface Obiettivo {
  /** Primary goal */
  primaryGoal: string;
  /** Target weight in kg (if applicable) */
  targetWeightKg?: number;
  /** Target body fat % (if applicable) */
  targetBodyFatPct?: number;
  /** Timeline in weeks */
  timelineWeeks?: number;
  /** Additional notes */
  notes?: string;
}

/** Monitoring check-in parameters */
export interface MonitoringConfig {
  /** Check-in frequency in days */
  checkInFrequencyDays: number;
  /** Metrics to track */
  metrics: string[];
  /** Re-assessment criteria */
  reassessmentNotes?: string;
}

// ── Supplement Protocol ─────────────────────────────────────────────────────

/** Single supplement recommendation */
export interface SupplementEntry {
  /** Supplement name */
  name: string;
  /** Daily dosage */
  dosage: string;
  /** Timing instructions */
  timing: string;
  /** Why it's recommended */
  rationale?: string;
}

// ── Guidance Section ────────────────────────────────────────────────────────

/** Narrative guidance and recommendations */
export interface GuidanceSection {
  /** Body composition analysis narrative */
  bodyCompAnalysis: string;
  /** Nutrition strategy explanation */
  nutritionStrategy: string;
  /** Training recommendations */
  trainingNotes?: string;
  /** Additional coach notes */
  coachNotes?: string;
}

// ── Day-Type Plan Summary ───────────────────────────────────────────────────

/** Summary of a single day-type plan for the PDF */
export interface DayTypePlanSummary {
  /** Day type identifier */
  dayType: DayType;
  /** Display label (e.g., "Giorno di Allenamento") */
  label: string;
  /** TDEE result for this day type */
  tdee: TdeeResult;
  /** Macro targets */
  macros: MacroTargets;
  /** Hydration targets */
  hydration: HydrationTargets;
  /** Meal plan (if generated) */
  mealPlan?: DayMealPlan;
}

// ── Complete Report Data ────────────────────────────────────────────────────

/** Complete data structure for generating a branded PDF report */
export interface PdfReportData {
  /** Client personal information */
  client: PdfClientInfo;
  /** Client snapshot (measurement data) */
  snapshot: ClientSnapshot;
  /** Body composition results */
  bodyComposition: BodyComposition;
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
  /** Monitoring configuration */
  monitoring?: MonitoringConfig;
  /** Plans per day type */
  dayTypePlans: DayTypePlanSummary[];
  /** Supplement protocol */
  supplements?: SupplementEntry[];
  /** Guidance narratives */
  guidance?: GuidanceSection;
}

// ── PDF Generation Options ──────────────────────────────────────────────────

/** Options for PDF generation */
export interface PdfGenerateOptions {
  /** Output format */
  format?: "A4" | "Letter";
  /** Include meal plan details */
  includeMealPlans?: boolean;
  /** Include supplement protocol */
  includeSupplements?: boolean;
  /** Include guidance narratives */
  includeGuidance?: boolean;
  /** Custom footer text */
  footerText?: string;
}
