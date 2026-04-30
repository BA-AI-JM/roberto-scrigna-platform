/**
 * Sport Correction Protocol (SCP) — Type Definitions
 *
 * All types for the 10-stage exercise energy expenditure pipeline.
 * Spec: v4.4 / v4.4.1 (Roberto Scrigna Nutrition Platform)
 */

// ── HR Zone Data ──────────────────────────────────────────────────────────────

/** Heart rate zone boundaries — 5 zones based on HRmax or lactate thresholds */
export interface HRZoneBoundaries {
  z1Max: number; // Upper boundary of Zone 1 (recovery)
  z2Max: number; // Upper boundary of Zone 2 (aerobic endurance)
  z3Max: number; // Upper boundary of Zone 3 (tempo)
  z4Max: number; // Upper boundary of Zone 4 (threshold)
  // Zone 5 = everything above z4Max
}

/** Time-in-zone data from a wearable export */
export interface HRZoneData {
  /**
   * Minutes spent in each zone.
   * Index 0 = below Z1, 1 = Z1, 2 = Z2, 3 = Z3, 4 = Z4, 5 = Z5
   */
  minutesPerZone: [number, number, number, number, number, number];
  /** Average heart rate for the session */
  avgHeartRate: number;
  /** Total recorded session duration (minutes) */
  totalRecordedMin: number;
  /** Optional: per-second or per-minute HR stream for cutoff detection */
  hrStream?: number[];
}

// ── Sport Taxonomy (two-level, spec §2) ──────────────────────────────────────

/**
 * Category IDs — the 8 sport categories defined in spec §2.
 * Each category maps to a metabolic Profile (G, L, or CYCLIC).
 */
export type CategoryId =
  | "GRAPPLING"   // Profile G — isometric-heavy (BJJ, wrestling, judo)
  | "STRIKING"    // Profile L — locomotion-dominant (boxing, kickboxing, muay thai)
  | "MMA"         // Profile G — mixed grappling/striking
  | "STRENGTH"    // Profile G — resistance training (gym)
  | "HIIT"        // Profile L — high-intensity interval training
  | "CYCLIC"      // Profile CYCLIC — steady-state aerobic (running, cycling, rowing)
  | "TEAM"        // Profile L — team sports (football, basketball, rugby)
  | "RACKET";     // Profile L — racket sports (tennis, squash, padel)

/**
 * Metabolic profiles that determine MET assignment.
 * G  = isometric-heavy (grappling-type)
 * L  = locomotion-dominant (striking/team-type)
 * CYCLIC = steady-state aerobic
 */
export type MetabolicProfile = "G" | "L" | "CYCLIC";

/**
 * Session types per category.
 * Each category has specific session types with distinct below-Z1 defaults.
 */
export type GrapplingSessionType = "mixed" | "drilling" | "sparring" | "competition";
export type StrikingSessionType = "bag_work" | "pad_work" | "sparring" | "technique";
export type MMASessionType = "mixed" | "sparring" | "competition";
export type StrengthSessionType = "hypertrophy" | "strength" | "power" | "circuit" | "deload";
export type HIITSessionType = "tabata" | "amrap" | "emom" | "general";
export type CyclicSessionType = "easy" | "tempo" | "interval" | "race";
export type TeamSessionType = "training" | "match" | "conditioning";
export type RacketSessionType = "training" | "match" | "drilling";

/** Union of all session types */
export type SessionType =
  | GrapplingSessionType
  | StrikingSessionType
  | MMASessionType
  | StrengthSessionType
  | HIITSessionType
  | CyclicSessionType
  | TeamSessionType
  | RacketSessionType;

// ── Sport Profiles ────────────────────────────────────────────────────────────

/**
 * Sport profile — produced by the profile lookup in stage6-met.
 * Contains all the resolved MET values for a given category + session type.
 */
export interface SportProfile {
  categoryId: CategoryId;
  sessionType: SessionType;
  metabolicProfile: MetabolicProfile;
  /** Is this a strength-category session? (triggers Stage 6b benchmark) */
  isStrengthCategory: boolean;
  /**
   * Net MET values per zone — spec-defined (gross - resting subtraction per profile).
   * Profile G: gross - 1.0
   * Profile L: gross - 0.5
   * Profile CYCLIC: gross (no subtraction, E=1.0 always)
   * STRENGTH conservative override: Z3-Z5 capped at 6.0 gross → 5.0 net
   */
  netMETs: {
    belowZ1WarmUp: number;   // Option C: structured low-intensity warm-up
    belowZ1Rest: number;     // Option D: planned rest / inter-set standing
    z1Standing: number;      // Z1 when standing (strength sessions)
    z1Moving: number;        // Z1 when moving (cardio sessions)
    z2: number;
    z3: number;
    z4: number;
    z5: number;
  };
  /**
   * Below-Z1 default classification for this session type.
   * "C" = Option C (warm-up/structured low-intensity)
   * "D" = Option D (planned rest)
   */
  belowZ1Default: "C" | "D";
  /**
   * Z1 character for this session type.
   * "standing" = standing recovery between sets (strength)
   * "moving"   = active low-intensity movement (cardio)
   */
  z1Character: "standing" | "moving";
}

// ── Data Quality Tiers ────────────────────────────────────────────────────────

/** Data quality tier — determines which pipeline path is used */
export type DataTier = 1 | 2 | 3;

// ── Stage Results ─────────────────────────────────────────────────────────────

/** Stage 0: Data quality tier classification result */
export interface TierResult {
  tier: DataTier;
  reason: string;
  hasHRZones: boolean;
  hasSportProfile: boolean;
  hasDeviceData: boolean;
}

/** Stage 2: Tail cutoff detection result */
export interface CutoffResult {
  /** Minutes excluded from tail */
  tailMinutesExcluded: number;
  /** Adjusted zone data with tail excluded (redistributed from belowZ1) */
  adjustedZoneData: HRZoneData;
  /** Whether cutoff was applied */
  cutoffApplied: boolean;
  cutoffReason?: string;
}

/** Stage 4: Below-Z1 time classification */
export interface BelowZ1Classification {
  /** Initial below-Z1 time = warm-up Option C (MET = belowZ1WarmUp) */
  warmUpMin: number;
  /** Middle below-Z1 = inter-set rest Option D (MET = belowZ1Rest) */
  interSetRestMin: number;
  /** Terminal below-Z1 = cool-down (already handled by Stage 2 cutoff) */
  coolDownMin: number;
  totalBelowZ1Min: number;
}

/** Stage 5: Z1 character classification */
export interface Z1Character {
  /** Standing recovery between sets (strength sessions) */
  standingMin: number;
  /** Active Z1 (light movement, cardio sessions) */
  activeZ1Min: number;
  totalZ1Min: number;
}

/** Stage 6b: Mechanical density benchmark result */
export interface BenchmarkResult {
  benchmarkMETGross: number;
  benchmarkMETNet: number;
  benchmarkKcal: number;
  hrModelKcal: number;
  blendedKcal: number;
  /** 50/50 midpoint when HR model < benchmark */
  blendRatio: { benchmark: number; hrModel: number };
  /** Only true for STRENGTH category sessions meeting trigger criteria */
  benchmarkApplied: boolean;
  /** Trigger criteria evaluation */
  triggerMet: {
    durationOk: boolean;
    hiFractionOk: boolean;
    belowZ1FractionOk: boolean;
  };
}

/** Stage 7: Efficiency factor result */
export interface EfficiencyResult {
  /** Fraction of active duration spent in Z4+Z5 */
  hiFraction: number;
  /**
   * E value applied to HR-model per-minute kcal.
   * Formula: max(0.5, min(1.0, 1.0 - hiFraction × 7.0))
   * Calibrated against spec worked example A.7 (E=0.78 at HI=3.1%).
   * CYCLIC sessions always use E=1.0.
   */
  efficiencyFactor: number;
}

/** Stage 8: Per-zone EEE breakdown entry */
export interface ZoneEEEBreakdown {
  zone: string;
  minutes: number;
  netMET: number;
  kcal: number;
}

/** Stage 9: Uncertainty range from ±E and ±belowZ1 MET perturbation */
export interface UncertaintyRange {
  lowKcal: number;
  highKcal: number;
  centralKcal: number;
  spreadKcal: number;
}

/** Stage 10: Device comparison */
export interface DeviceComparison {
  deviceKcal: number;
  protocolKcal: number;
  /** protocol / device */
  correctionFactor: number;
  /** ((deviceKcal - protocolKcal) / protocolKcal) × 100 */
  deviceOverestimationPct: number;
}

// ── Complete SCP Result ───────────────────────────────────────────────────────

/** Complete Sport Correction Protocol result */
export interface SCPResult {
  tier: TierResult;
  cutoff: CutoffResult;
  activeDurationMin: number;
  belowZ1: BelowZ1Classification;
  z1Character: Z1Character;
  /** Only present for STRENGTH category sessions with Stage 6b trigger met */
  benchmark?: BenchmarkResult;
  efficiency: EfficiencyResult;
  zoneBreakdown: ZoneEEEBreakdown[];
  totalEEEKcal: number;
  uncertainty: UncertaintyRange;
  /** Only present when deviceKcal was provided as input */
  deviceComparison?: DeviceComparison;
  methodUsed: "sport_correction_protocol";
  /** Compatible with ExerciseResult.exerciseKcal */
  exerciseKcal: number;
  /** Always 1.0 — SCP does its own correction internally */
  recalibrationFactor: 1.0;
}

// ── SCP Input ─────────────────────────────────────────────────────────────────

/** Input to the Sport Correction Protocol pipeline */
export interface SCPInput {
  /** HR zone data from wearable (required for Tier 1) */
  hrZoneData?: HRZoneData;
  /** Category of sport session */
  categoryId: CategoryId;
  /** Session type within the category */
  sessionType: SessionType;
  /** Total session duration (minutes) */
  durationMin: number;
  /** Client body weight */
  weightKg: number;
  /** Client age */
  ageYears: number;
  /** Client sex */
  sex: "male" | "female";
  /** Optional: device-reported kcal for Stage 10 comparison */
  deviceKcal?: number;
  /** Optional: average HR (for Tier 2 fallback when no zone data) */
  avgHeartRate?: number;
  /** Optional: MET value (for Tier 3 fallback) */
  metValue?: number;
  /** Optional: RPE-based kcal estimate */
  kcalEstimate?: number;
}
