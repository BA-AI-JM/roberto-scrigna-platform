/**
 * #11 combat-sport protocols — engine invariants.
 *
 * Three SELECTABLE modes layered as JOINT constraints on the solved plan (no
 * additive passes): fibre RESTRICTION (cap), sodium RESTRICTION (cap), and the
 * water-loading fluid schedule. The hard contract is unchanged — kcal + protein
 * stay PROTECTED ±5%; the restriction caps and the water schedule are additional
 * constraints that YIELD to the protected pair (so on a high-carb day the strict
 * cap may be approached but not reached — that is correct, not a bug).
 */

import { describe, test, expect } from "vitest";
import { createMealPlan } from "../planner";
import type { MealPlanConfig } from "../types";
import { FIBRE_RESTRICTION_CAP_G, SODIUM_RESTRICTION_CAP_MG } from "../types";
import { waterLoadingSchedule } from "../../hydration";
import { ALL_TEMPLATES } from "../../../data/meals/templates";
import type { MacroTargets } from "../../types";

const PCT = 5;
function rx(p: number, f: number, c: number, d: MacroTargets["dayType"]): MacroTargets {
  return { proteinG: p, fatG: f, carbG: c, totalKcal: p * 4 + c * 4 + f * 9, dayType: d };
}
const pctDiff = (a: number, t: number) => (t === 0 ? 0 : ((a - t) / t) * 100);

function plan(macros: MacroTargets, meals: number, restrict: "off" | "fibre" | "sodium" | "both") {
  const config: MealPlanConfig = {
    dayType: macros.dayType,
    macroTargets: macros,
    mealCount: meals,
    substitutionsPerSlot: 3,
    ...(restrict === "fibre" || restrict === "both"
      ? { fibreMode: "cap" as const, fibreCapG: FIBRE_RESTRICTION_CAP_G }
      : {}),
    ...(restrict === "sodium" || restrict === "both" ? { sodiumCapMg: SODIUM_RESTRICTION_CAP_MG } : {}),
  };
  return createMealPlan(ALL_TEMPLATES, config);
}

// A feasible fight-week cutting day where the strict caps ARE reachable.
const FEASIBLE = rx(150, 55, 50, "rest");

describe("fibre_restriction (#11)", () => {
  test("keeps day fibre < 10 g on a feasible fight-week day, pair protected", () => {
    const g = plan(FEASIBLE, 4, "fibre").actualMacros;
    expect(g.fibreG ?? 0).toBeLessThan(10);
    expect(Math.abs(pctDiff(g.kcal, FEASIBLE.totalKcal))).toBeLessThanOrEqual(PCT);
    expect(Math.abs(pctDiff(g.proteinG, FEASIBLE.proteinG))).toBeLessThanOrEqual(PCT);
  });

  test("reduces day fibre vs OFF on every day-type, pair protected", () => {
    for (const m of [rx(165, 55, 110, "training"), rx(160, 60, 80, "rest"), rx(170, 70, 70, "training")]) {
      const off = plan(m, 4, "off").actualMacros;
      const on = plan(m, 4, "fibre").actualMacros;
      expect(on.fibreG ?? 0).toBeLessThan(off.fibreG ?? 0); // restriction lowers fibre
      expect(Math.abs(pctDiff(on.kcal, m.totalKcal))).toBeLessThanOrEqual(PCT);
      expect(Math.abs(pctDiff(on.proteinG, m.proteinG))).toBeLessThanOrEqual(PCT);
    }
  });
});

describe("sodium_restriction (#11)", () => {
  test("keeps day sodium < 500 mg on a feasible fight-week day, pair protected", () => {
    const g = plan(FEASIBLE, 4, "sodium").actualMacros;
    expect(g.sodiumMg ?? 0).toBeLessThan(SODIUM_RESTRICTION_CAP_MG);
    expect(Math.abs(pctDiff(g.kcal, FEASIBLE.totalKcal))).toBeLessThanOrEqual(PCT);
    expect(Math.abs(pctDiff(g.proteinG, FEASIBLE.proteinG))).toBeLessThanOrEqual(PCT);
  });

  test("sharply reduces day sodium vs OFF, pair protected (yields to protein)", () => {
    // Protein-source sodium is protected, so the cap may not be reached on every
    // day — but the reduction must be large (≥ 25%) and the pair stays protected.
    for (const m of [rx(160, 60, 80, "rest"), rx(165, 55, 110, "training")]) {
      const off = plan(m, 4, "off").actualMacros;
      const on = plan(m, 4, "sodium").actualMacros;
      expect(on.sodiumMg ?? 0).toBeLessThanOrEqual((off.sodiumMg ?? 0) * 0.75);
      expect(Math.abs(pctDiff(on.kcal, m.totalKcal))).toBeLessThanOrEqual(PCT);
      expect(Math.abs(pctDiff(on.proteinG, m.proteinG))).toBeLessThanOrEqual(PCT);
    }
  });
});

describe("combined fight-week (fibre + sodium) (#11)", () => {
  const p = plan(FEASIBLE, 4, "both");
  const g = p.actualMacros;

  test("both caps met together with kcal+protein protected", () => {
    expect(g.fibreG ?? 0).toBeLessThan(10);
    expect(g.sodiumMg ?? 0).toBeLessThan(SODIUM_RESTRICTION_CAP_MG);
    expect(Math.abs(pctDiff(g.kcal, FEASIBLE.totalKcal))).toBeLessThanOrEqual(PCT);
    expect(Math.abs(pctDiff(g.proteinG, FEASIBLE.proteinG))).toBeLessThanOrEqual(PCT);
  });

  test("no NaN / zero-gram ingredient; eggs still whole 60 g units", () => {
    for (const slot of p.slots) {
      for (const ing of [slot.primary, ...slot.substitutions].flatMap((m) => m.scaledIngredients)) {
        expect(Number.isFinite(ing.grams)).toBe(true);
        expect(ing.grams).toBeGreaterThan(0);
        if (ing.foodId === "uova-intere") expect(ing.grams % 60).toBe(0);
      }
    }
  });
});

describe("water_loading (#11)", () => {
  test("3 high-volume load days at 70–90 mL/kg then a ≤1 L taper", () => {
    const s = waterLoadingSchedule(70);
    expect(s.days).toHaveLength(4);
    expect(s.mlPerKgLoad).toBe(80);
    expect(s.days.slice(0, 3).every((d) => d.phase === "load")).toBe(true);
    expect(s.days.slice(0, 3).every((d) => d.fluidMl === 5600)).toBe(true); // 80 × 70
    expect(s.days[3]!.phase).toBe("taper");
    expect(s.days[3]!.fluidMl).toBe(500);
    expect(s.days[3]!.fluidMl).toBeLessThanOrEqual(1000);
  });

  test("scales with bodyweight and clamps mL/kg + taper to spec bounds", () => {
    expect(waterLoadingSchedule(90).days[0]!.fluidMl).toBe(7200); // 80 × 90
    // mL/kg clamped to 70–90; taper clamped to 250–1000.
    expect(waterLoadingSchedule(80, { mlPerKg: 200 }).mlPerKgLoad).toBe(90);
    expect(waterLoadingSchedule(80, { mlPerKg: 10 }).mlPerKgLoad).toBe(70);
    expect(waterLoadingSchedule(80, { taperMl: 5000 }).days.at(-1)!.fluidMl).toBe(1000);
  });
});

describe("modes OFF = unchanged (regression) (#11)", () => {
  test("omitting protocols equals explicit floor mode + no sodium cap (byte-identical macros)", () => {
    const m = rx(160, 60, 200, "training");
    const a = plan(m, 4, "off").actualMacros;
    const b = createMealPlan(ALL_TEMPLATES, {
      dayType: "training",
      macroTargets: m,
      mealCount: 4,
      substitutionsPerSlot: 3,
      fibreMode: "floor",
    }).actualMacros;
    expect(b).toEqual(a);
  });

  test("OFF still honours the fibre FLOOR (default behaviour intact)", () => {
    const m = rx(160, 60, 200, "training");
    const g = plan(m, 4, "off").actualMacros;
    const floor = (10 * g.kcal) / 1000;
    expect(g.fibreG ?? 0).toBeGreaterThanOrEqual(floor - 0.5);
  });
});
