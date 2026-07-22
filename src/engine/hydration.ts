/**
 * Hydration and salt intake targets.
 *
 * Water: ~37.5 ml per kg body weight, adjusted for training days.
 * Salt: 5-7g per day base, increased on training days for electrolyte replacement.
 */

import type { DayType, HydrationTargets } from "./types";
import { isTrainingLikeDayType } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Base water intake: ~37.5 ml per kg body weight */
const BASE_WATER_ML_PER_KG = 37.5;

/** Additional water on training days (ml) */
const TRAINING_WATER_BONUS_ML = 500;

/**
 * D3a (R5, Roberto 2026-07-21): salt is LINKED TO WATER — 1 g of salt per
 * litre of water for the day (his exact rule; water itself is 30–40 mL/kg,
 * which the 37.5 base + training bonus already satisfies). The previous flat
 * 5 g + 1.5 g training bonus produced the 6.5 g/day he flagged as wrong.
 */
const SALT_G_PER_WATER_L = 1;

/**
 * N6/N7 (Roberto, 2026-07-22): fibre 10–20 g per 1000 kcal, INVERSE to energy —
 * low-energy plans sit at the top of the band (satiety), high-energy at the
 * bottom. Anchors (engineering fill within his stated rule, visible in the
 * assumptions for his glance): ≤1500 kcal → 20 g/1000; ≥3000 kcal → 10 g/1000;
 * linear in between.
 */
export function fibreRatePer1000(targetKcal: number): number {
  if (targetKcal <= 1500) return 20;
  if (targetKcal >= 3000) return 10;
  return Math.round((20 - ((targetKcal - 1500) / 1500) * 10) * 10) / 10;
}

/** Absolute daily fibre target (g) from the day's kcal target. */
export function fibreTargetG(targetKcal: number): number {
  return Math.round((fibreRatePer1000(targetKcal) * targetKcal) / 1000);
}

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
  // #17: training tiers are training-like → get the active-day hydration bonus.
  const isActive = isTrainingLikeDayType(dayType) || dayType === "deload";

  const baseWater = Math.round(BASE_WATER_ML_PER_KG * weightKg);
  const waterMl = isActive ? baseWater + TRAINING_WATER_BONUS_ML : baseWater;

  // Salt follows the day's water 1 g/L (R5) — rounded to 0.1 g.
  const saltG = Math.round((waterMl / 1000) * SALT_G_PER_WATER_L * 10) / 10;

  return { waterMl, saltG };
}

// ── Water loading (#11 combat-sport protocol) ────────────────────────────────

/** Load-day fluid: midpoint of Roberto's 70–90 mL/kg/day band. */
const WATER_LOADING_ML_PER_KG = 80;
/** Number of high-volume load days before the taper. */
const WATER_LOADING_LOAD_DAYS = 3;
/** Final taper-day cut (Roberto's spec: ≤ 500 mL – 1 L). */
const WATER_LOADING_TAPER_ML = 500;

const clampNum = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** One day of the water-loading schedule. */
export interface WaterLoadingDay {
  /** 1-indexed day in the schedule. */
  day: number;
  /** Fluid target for the day (mL). */
  fluidMl: number;
  /** "load" = high-volume days; "taper" = the final cut day. */
  phase: "load" | "taper";
}

/** A water-loading fluid schedule for the plan/PDF to render. */
export interface WaterLoadingSchedule {
  /** Per-day fluid targets (loadDays of "load" then one "taper"). */
  days: WaterLoadingDay[];
  /** mL/kg used on load days. */
  mlPerKgLoad: number;
  /** Body weight the schedule was computed for (kg). */
  weightKg: number;
}

/**
 * Build a combat-sport water-loading schedule: `loadDays` high-volume days at
 * 70–90 mL/kg/day, then a final taper day capped at ≤ 500 mL – 1 L. This is a
 * HYDRATION schedule (per-day fluid targets in mL), not a macro change — it does
 * not touch the meal plan.
 */
export function waterLoadingSchedule(
  weightKg: number,
  opts: { mlPerKg?: number; loadDays?: number; taperMl?: number } = {}
): WaterLoadingSchedule {
  const w = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0;
  const mlPerKg = clampNum(opts.mlPerKg ?? WATER_LOADING_ML_PER_KG, 70, 90);
  const loadDays = Math.max(1, Math.round(opts.loadDays ?? WATER_LOADING_LOAD_DAYS));
  const taperMl = clampNum(opts.taperMl ?? WATER_LOADING_TAPER_ML, 250, 1000);
  const loadMl = Math.round(mlPerKg * w);

  const days: WaterLoadingDay[] = [];
  for (let d = 1; d <= loadDays; d++) {
    days.push({ day: d, fluidMl: loadMl, phase: "load" });
  }
  days.push({ day: loadDays + 1, fluidMl: taperMl, phase: "taper" });

  return { days, mlPerKgLoad: mlPerKg, weightKg: w };
}
