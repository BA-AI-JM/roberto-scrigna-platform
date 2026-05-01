/**
 * Hydration and salt intake targets.
 *
 * Water: ~37.5 ml per kg body weight, adjusted for training days.
 * Salt: 5-7g per day base, increased on training days for electrolyte replacement.
 */

import type { DayType, HydrationTargets } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base water intake: ~37.5 ml per kg body weight */
const BASE_WATER_ML_PER_KG = 37.5;

/** Additional water on training days (ml) */
const TRAINING_WATER_BONUS_ML = 500;

/** Base daily salt intake (g) */
const BASE_SALT_G = 5;

/** Additional salt on training days (g) */
const TRAINING_SALT_BONUS_G = 1.5;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calculate daily hydration and salt targets.
 *
 * @param weightKg - Client body weight
 * @param dayType - Type of day (training gets bonus hydration)
 * @returns Water in ml and salt in grams
 */
export function calculateHydration(
  weightKg: number,
  dayType: DayType
): HydrationTargets {
  const isActive = dayType === "training" || dayType === "deload";

  const baseWater = Math.round(BASE_WATER_ML_PER_KG * weightKg);
  const waterMl = isActive ? baseWater + TRAINING_WATER_BONUS_ML : baseWater;

  const saltG = isActive
    ? Math.round((BASE_SALT_G + TRAINING_SALT_BONUS_G) * 10) / 10
    : BASE_SALT_G;

  return { waterMl, saltG };
}
