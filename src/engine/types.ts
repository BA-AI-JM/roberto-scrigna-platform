/**
 * Types for the Roberto Scrigna macro calculation engine.
 * Based on spec v4.4 / v4.4.1.
 */

// ── Gender & Activity ─────────────────────────────────────────────────────────

export type Sex = "male" | "female";

export type OccupationalLevel =
  | "sedentary"    // desk job
  | "light"        // teacher, retail
  | "moderate"     // nurse, construction-light
  | "heavy"        // manual labour
  | "very_heavy";  // extreme physical work

export type DayType =
  | "training"
  | "rest"
  | "refeed"
  | "deload"
  // #17 periodization intensity tiers (modes 3-4). "rest" doubles as OFF.
  // Training-like day-types graded by session intensity; intensity flows through
  // TDEE + the carb remainder, NOT through protein/fat ratio changes.
  | "training_light"
  | "training_medium"
  | "training_intense"
  | "training_double";

/**
 * #17: is this a training-like day-type — base `training` or any intensity tier?
 * Tiers inherit training-day behaviour (per-day session override, peri-workout
 * hydration). `deload` is NOT training-like (it has its own reduced-session path).
 */
export function isTrainingLikeDayType(dayType: DayType): boolean {
  return (
    dayType === "training" ||
    dayType === "training_light" ||
    dayType === "training_medium" ||
    dayType === "training_intense" ||
    dayType === "training_double"
  );
}

// ── Skinfold & Body Composition ────────────────────────────────────────────────

/** Jackson & Pollock 7-site skinfold measurements (mm) */
export interface Skinfold7Site {
  chest: number;
  midaxillary: number;
  tricep: number;
  subscapular: number;
  abdominal: number;
  suprailiac: number;
  thigh: number;
}

/** Jackson & Pollock 3-site skinfold measurements (mm) */
export interface Skinfold3SiteMale {
  chest: number;
  abdominal: number;
  thigh: number;
}

export interface Skinfold3SiteFemale {
  tricep: number;
  suprailiac: number;
  thigh: number;
}

export type Skinfold3Site = Skinfold3SiteMale | Skinfold3SiteFemale;

export interface BodyComposition {
  bodyFatPct: number;
  leanMassKg: number;
  fatMassKg: number;
}

// ── Client Snapshot (input to all calculations) ───────────────────────────────

export interface ClientSnapshot {
  sex: Sex;
  ageYears: number;
  weightKg: number;
  heightCm: number;

  /** Skinfold data — 7-site preferred, 3-site fallback, heuristic if neither */
  skinfold7?: Skinfold7Site;
  skinfold3?: Skinfold3Site;
  /** Manual BF% override (heuristic / visual estimate) */
  bodyFatPctOverride?: number;

  /** Daily step count */
  dailySteps: number;
  occupationalLevel: OccupationalLevel;

  /** Day-type schedule for the week (7 entries, Mon-Sun) */
  weekSchedule: [DayType, DayType, DayType, DayType, DayType, DayType, DayType];
}

// ── Exercise Session ──────────────────────────────────────────────────────────

export type ExerciseMethod =
  | "sport_correction_protocol" // Method 0: SCP — HR zones + sport profile (highest accuracy)
  | "heart_rate"                // Method 1: Keytel HR-based (average HR only)
  | "met_value"                 // Method 2: MET × weight × duration
  | "session_estimate"          // Method 3: Per-session kcal estimate
  | "default_estimate";         // Method 4: Default 300kcal fallback

export interface ExerciseSession {
  method: ExerciseMethod;
  /** Duration in minutes */
  durationMin: number;
  /** Average heart rate (for HR method or Tier 2 SCP fallback) */
  avgHeartRate?: number;
  /** MET value (for MET method) */
  metValue?: number;
  /** Direct kcal estimate (for session_estimate method) */
  kcalEstimate?: number;
  /** SCP inputs — when present, SCP is attempted before Keytel fallback */
  scpData?: {
    hrZoneData: import("./sport-correction/types").HRZoneData;
    categoryId: import("./sport-correction/types").CategoryId;
    sessionType: import("./sport-correction/types").SessionType;
    deviceKcal?: number;
  };
}

// ── TDEE Override ─────────────────────────────────────────────────────────────

export interface TdeeOverride {
  dayType: DayType;
  tdeeKcal: number;
}

// ── Calculation Results ───────────────────────────────────────────────────────

export interface BmrResult {
  bmrKcal: number;
  bodyComposition: BodyComposition;
}

export interface NeatResult {
  stepsKcal: number;
  occupationalKcal: number;
  totalNeatKcal: number;
}

export interface TefResult {
  tefKcal: number;
  /** TEF percentage applied (typically 8-15%) */
  tefPct: number;
}

export interface ExerciseResult {
  exerciseKcal: number;
  /** Which method was used */
  methodUsed: ExerciseMethod;
  /** v4.4.1 recalibration factor applied */
  recalibrationFactor: number;
}

export interface TdeeResult {
  bmr: BmrResult;
  neat: NeatResult;
  tef: TefResult;
  exercise: ExerciseResult;
  totalTdeeKcal: number;
  dayType: DayType;
}

export interface MacroTargets {
  proteinG: number;
  fatG: number;
  carbG: number;
  totalKcal: number;
  dayType: DayType;
}

export interface HydrationTargets {
  waterMl: number;
  saltG: number;
}

// ── Full Plan Output ──────────────────────────────────────────────────────────

export interface DailyPlan {
  dayType: DayType;
  tdee: TdeeResult;
  macros: MacroTargets;
  hydration: HydrationTargets;
}

export interface WeeklyPlan {
  days: [DailyPlan, DailyPlan, DailyPlan, DailyPlan, DailyPlan, DailyPlan, DailyPlan];
  weeklyAverageKcal: number;
  weeklyAverageProteinG: number;
}
