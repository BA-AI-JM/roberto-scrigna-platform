/**
 * Goal-rate calculator — translates "I want to weigh X by date Y" into a
 * concrete daily kcal target, with safety floors and an aggressiveness band.
 *
 * Spec is silent on the upfront-deficit math, so we apply practitioner
 * defaults (May 2026):
 *
 *   Fat-loss cap:    1.0 % bodyweight / week
 *   Muscle-gain cap: 0.5 % bodyweight / week
 *   kcal floor:      max(22 × lean_mass_kg, 1200 kcal/day)
 *   % TDEE check:    deficit > 25 % TDEE bumps the aggressiveness band up one
 *
 * Pure, side-effect-free; tested in __tests__/goal-rate.test.ts.
 */

export type GoalDirection = "fat_loss" | "muscle_gain" | "maintenance";

export type AggressivenessBand =
  | "comfortable"
  | "moderate"
  | "aggressive"
  | "extreme";

export interface GoalRateInput {
  /** Current bodyweight in kg. */
  currentKg: number;
  /** Target bodyweight in kg. */
  targetKg: number;
  /** Time available in weeks. */
  weeks: number;
  /** Weekly-average TDEE in kcal/day. */
  tdeeKcal: number;
  /** Lean (fat-free) mass in kg — drives the kcal safety floor. */
  leanMassKg: number;
}

export interface GoalRateResult {
  direction: GoalDirection;
  /** Absolute kg delta. Positive when fat loss is required, negative for gain. */
  totalDeltaKg: number;
  /** Required rate in kg/week (always non-negative). */
  requiredKgPerWeek: number;
  /** Required rate as % of current bodyweight per week. */
  percentBwPerWeek: number;
  /**
   * Daily kcal deficit (positive) for fat loss; daily surplus (negative)
   * for muscle gain; 0 for maintenance.
   */
  dailyDeficitKcal: number;
  /** Implied daily intake target: tdeeKcal − dailyDeficitKcal. */
  targetDailyKcal: number;
  /** Minimum safe daily intake. Plans that fall below this should be blocked. */
  kcalFloor: number;
  /** True when targetDailyKcal < kcalFloor. */
  belowFloor: boolean;
  /** Aggressiveness band — derived from % BW/wk, bumped up one if > 25 % TDEE. */
  band: AggressivenessBand;
  /** Cap for the chosen direction (% bodyweight/week). */
  capPercentBwPerWeek: number;
  /**
   * If band is "extreme", a suggested timeline (whole weeks, rounded up) at
   * which both the % BW/wk and 25 % TDEE bounds are honoured.
   */
  suggestedWeeks?: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** 1 kg of tissue ≈ 7700 kcal (classic dietetic approximation). */
const KCAL_PER_KG = 7700;
/** Absolute kcal floor — never go below this regardless of lean mass. */
const KCAL_FLOOR_ABS = 1200;
/** Per-kg-lean kcal floor multiplier — covers BMR + small NEAT margin. */
const KCAL_FLOOR_PER_LEAN = 22;
/** Direction is "maintenance" when |delta| ≤ this. */
const MAINTENANCE_DELTA_KG = 0.5;
/** Deficit-as-share-of-TDEE threshold that bumps the band up one level. */
const HIGH_TDEE_DEFICIT_FRACTION = 0.25;

/** % bodyweight per week caps. */
const CAP_PCT_BW_PER_WEEK = {
  fat_loss: 1.0,
  muscle_gain: 0.5,
} as const;

/** Band thresholds in % BW/week. */
const BANDS_FAT_LOSS: Array<{ band: AggressivenessBand; max: number }> = [
  { band: "comfortable", max: 0.5 },
  { band: "moderate", max: 0.75 },
  { band: "aggressive", max: 1.0 },
];
const BANDS_MUSCLE_GAIN: Array<{ band: AggressivenessBand; max: number }> = [
  { band: "comfortable", max: 0.25 },
  { band: "moderate", max: 0.4 },
  { band: "aggressive", max: 0.5 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute weeks between two dates. Returns 0 for past or invalid dates.
 * Caller-friendly: accepts either an ISO string or a Date.
 */
export function weeksUntil(
  targetDate: string | Date,
  from: string | Date = new Date()
): number {
  const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
  const fromD = typeof from === "string" ? new Date(from) : from;
  if (Number.isNaN(target.getTime()) || Number.isNaN(fromD.getTime())) return 0;
  const ms = target.getTime() - fromD.getTime();
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24 * 7);
}

function bandFromPercentBw(
  direction: GoalDirection,
  percentBwPerWeek: number
): AggressivenessBand {
  if (direction === "maintenance") return "comfortable";
  const ladder = direction === "muscle_gain" ? BANDS_MUSCLE_GAIN : BANDS_FAT_LOSS;
  for (const { band, max } of ladder) {
    if (percentBwPerWeek <= max) return band;
  }
  return "extreme";
}

function bumpBand(band: AggressivenessBand): AggressivenessBand {
  if (band === "comfortable") return "moderate";
  if (band === "moderate") return "aggressive";
  if (band === "aggressive") return "extreme";
  return "extreme";
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Translate a target weight + timeline into a daily kcal target + safety
 * verdict. Pure and deterministic. See file header for the cap logic.
 */
export function computeGoalRate(input: GoalRateInput): GoalRateResult {
  const { currentKg, targetKg, weeks, tdeeKcal, leanMassKg } = input;

  const totalDeltaKg = currentKg - targetKg;
  const absDeltaKg = Math.abs(totalDeltaKg);
  const isMaintenance = absDeltaKg < MAINTENANCE_DELTA_KG || weeks <= 0;
  const direction: GoalDirection = isMaintenance
    ? "maintenance"
    : totalDeltaKg > 0
    ? "fat_loss"
    : "muscle_gain";

  const capPercentBwPerWeek =
    direction === "muscle_gain"
      ? CAP_PCT_BW_PER_WEEK.muscle_gain
      : CAP_PCT_BW_PER_WEEK.fat_loss;

  const kcalFloor = Math.max(KCAL_FLOOR_ABS, leanMassKg * KCAL_FLOOR_PER_LEAN);

  if (isMaintenance) {
    return {
      direction,
      totalDeltaKg,
      requiredKgPerWeek: 0,
      percentBwPerWeek: 0,
      dailyDeficitKcal: 0,
      targetDailyKcal: Math.round(tdeeKcal),
      kcalFloor: Math.round(kcalFloor),
      belowFloor: tdeeKcal < kcalFloor,
      band: "comfortable",
      capPercentBwPerWeek,
    };
  }

  const requiredKgPerWeek = absDeltaKg / weeks;
  const percentBwPerWeek = currentKg > 0 ? (requiredKgPerWeek / currentKg) * 100 : 0;

  // Signed deficit: positive for fat loss (subtract from intake),
  // negative for gain (add to intake).
  const signedDeficit =
    direction === "fat_loss"
      ? (requiredKgPerWeek * KCAL_PER_KG) / 7
      : -(requiredKgPerWeek * KCAL_PER_KG) / 7;
  const targetDailyKcal = tdeeKcal - signedDeficit;

  // Band from % BW/wk, then bump up one if deficit is also > 25 % TDEE.
  let band = bandFromPercentBw(direction, percentBwPerWeek);
  const percentTdee = tdeeKcal > 0 ? Math.abs(signedDeficit) / tdeeKcal : 0;
  if (percentTdee > HIGH_TDEE_DEFICIT_FRACTION) {
    band = bumpBand(band);
  }

  // Suggested timeline: the longer of "% BW cap" and "% TDEE cap" weeks counts.
  let suggestedWeeks: number | undefined;
  if (band === "extreme") {
    const weeksAtBwCap = absDeltaKg / (currentKg * (capPercentBwPerWeek / 100));
    // Daily deficit ≤ 25 % TDEE  ⇒  weekly kg ≤ (0.25 × TDEE × 7) / 7700
    const weeksAtTdeeCap =
      tdeeKcal > 0
        ? (absDeltaKg * KCAL_PER_KG) / (HIGH_TDEE_DEFICIT_FRACTION * tdeeKcal * 7)
        : weeksAtBwCap;
    suggestedWeeks = Math.max(1, Math.ceil(Math.max(weeksAtBwCap, weeksAtTdeeCap)));
  }

  return {
    direction,
    totalDeltaKg,
    requiredKgPerWeek: Math.round(requiredKgPerWeek * 100) / 100,
    percentBwPerWeek: Math.round(percentBwPerWeek * 100) / 100,
    dailyDeficitKcal: Math.round(signedDeficit),
    targetDailyKcal: Math.round(targetDailyKcal),
    kcalFloor: Math.round(kcalFloor),
    belowFloor: targetDailyKcal < kcalFloor,
    band,
    capPercentBwPerWeek,
    suggestedWeeks,
  };
}
