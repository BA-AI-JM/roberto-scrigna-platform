/**
 * T1.13-test / T2.3 — Reconciliation invariant (Terminal-2 lane, ADDITIVE).
 *
 * The clinical covenant (NORTHSTAR §Clinical): "Reconciliation is an invariant —
 * what was prescribed ≈ what the plan delivers." This is the WIDE-GRID companion
 * to the focused per-case contract in `macro-reconciliation.test.ts`; it does NOT
 * duplicate it — it sweeps the whole deficit/meal-count grid and pins the register
 * G33 fat hole with the numbers a regression must not silently move.
 *
 * MEASURED REALITY (engine HEAD 19bac2f, tested 2026-07-20 via the same solver the
 * `t113-deficit-sweep.ts` artifact drives — numbers reproduced 1:1 with the register):
 *   • PROTECTED pair (kcal + protein) reconciles ±5% across the ENTIRE grid.
 *     Protein worst −2.9% (−5 g) @ hard-cut-rest/3m; kcal worst +2.8%. HARD, green today.
 *   • FAT under-delivers systematically on 3–4-meal deficit plans — worst −19.9%
 *     @ maint-train/4m, −14.2% @ mod-cut-rest/3m, −11.8% @ roberto-case/3m — while
 *     `withinTolerance === true`, because the tolerance verdict is kcal+protein only
 *     (reconcile.ts:48-56). This is register G33 and pt2 Item-21's engine surface.
 *   • The per-macro fat/carb BOUNDS are Roberto's ruling, not ours (HITL-MANIFEST
 *     EF4). So fat/carb are documented here as `test.todo` / expected-fail with the
 *     measured drift — NOT asserted green. When EF4 lands, the expected-fail markers
 *     become hard bounds and the generation-time gate (T1.13 step 3) reads them.
 *
 * Do NOT "fix" the expected-fail markers to make them pass — the RED is the signal
 * that fat is unbounded today. Terminal 1 turns them green when EF4 bounds arrive.
 */

import { describe, test, expect } from "vitest";
import { createMealPlan } from "../planner";
import { withinReconcileTolerance } from "../reconcile";
import type { MealPlanConfig } from "../types";
import type { MacroTargets } from "../../types";
import { ALL_TEMPLATES } from "../../../data/meals/templates";

// Protected-pair tolerance — the engine's own RECONCILE_TOLERANCE_PCT.
const PROTECTED_PCT = 5;

function rx(
  proteinG: number,
  fatG: number,
  carbG: number,
  dayType: MacroTargets["dayType"] = "training"
): MacroTargets {
  return { proteinG, fatG, carbG, totalKcal: proteinG * 4 + carbG * 4 + fatG * 9, dayType };
}

const pctDiff = (actual: number, target: number): number =>
  target === 0 ? (actual === 0 ? 0 : 100) : ((actual - target) / target) * 100;

interface Scenario {
  label: string;
  macros: MacroTargets;
  mealCount: number;
}

// ── The wide deficit grid (maintenance → contest-prep × 3/4/5 meals) ──────────
// Same prescriptions the t113-deficit-sweep artifact drives — the grid where the
// fat hole surfaces (register G33 step-1b evidence).
const WIDE_GRID: Scenario[] = [];
for (const [label, p, f, c, day] of [
  ["maint-train", 180, 80, 350, "training"],
  ["mod-cut-train", 180, 60, 220, "training"],
  ["mod-cut-rest", 180, 65, 140, "rest"],
  ["hard-cut-train", 175, 50, 150, "training"],
  ["hard-cut-rest", 175, 50, 90, "rest"],
  ["prep-train", 170, 45, 110, "training"],
  ["prep-rest", 165, 40, 70, "rest"],
  ["roberto-case", 165, 55, 130, "rest"], // pt2 Item-21 territory (160-170 g P)
] as const) {
  for (const meals of [3, 4, 5]) {
    WIDE_GRID.push({ label: `${label}/${meals}m`, macros: rx(p, f, c, day), mealCount: meals });
  }
}

// ── Fidelity-style prescriptions (the shapes real plans take) ─────────────────
const FIDELITY_STYLE: Scenario[] = [
  { label: "moderate-cut 160P/180C/3m", macros: rx(160, 70, 180, "rest"), mealCount: 3 },
  { label: "roberto-style 165P/210C/4m", macros: rx(165, 70, 210, "training"), mealCount: 4 },
  { label: "rest-day 155P/190C/4m", macros: rx(155, 65, 190, "rest"), mealCount: 4 },
  { label: "balanced 150P/205C/5m", macros: rx(150, 60, 205, "training"), mealCount: 5 },
  { label: "lean-gain 175P/230C/6m", macros: rx(175, 75, 230, "training"), mealCount: 6 },
];

const ALL_SCENARIOS = [...WIDE_GRID, ...FIDELITY_STYLE];

/** Run the real solver and return the reconciliation view for a scenario. */
function reconcile(s: Scenario) {
  const config: MealPlanConfig = {
    dayType: s.macros.dayType,
    macroTargets: s.macros,
    mealCount: s.mealCount,
    substitutionsPerSlot: 3,
  };
  const plan = createMealPlan(ALL_TEMPLATES, config);
  const a = plan.actualMacros;
  return {
    plan,
    kcalPct: pctDiff(a.kcal, s.macros.totalKcal),
    proteinPct: pctDiff(a.proteinG, s.macros.proteinG),
    fatPct: pctDiff(a.fatG, s.macros.fatG),
    carbPct: pctDiff(a.carbsG, s.macros.carbG),
    withinTolerance: plan.withinTolerance,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PROTECTED PAIR — hard invariant, green today across the whole grid.
// ═══════════════════════════════════════════════════════════════════════════
describe("Reconciliation invariant — protected pair (kcal + protein) holds grid-wide", () => {
  for (const s of ALL_SCENARIOS) {
    test(`${s.label}: kcal & protein within ±${PROTECTED_PCT}% of prescription`, () => {
      const r = reconcile(s);
      const summary =
        `\n  Rx  → P ${s.macros.proteinG} F ${s.macros.fatG} C ${s.macros.carbG} (${s.macros.totalKcal} kcal, ${s.mealCount} meals)` +
        `\n  got → kcal ${r.kcalPct.toFixed(1)}%  P ${r.proteinPct.toFixed(1)}%  F ${r.fatPct.toFixed(1)}%  C ${r.carbPct.toFixed(1)}%`;
      expect(Math.abs(r.kcalPct), `KCAL out of protected band${summary}`).toBeLessThanOrEqual(PROTECTED_PCT);
      expect(Math.abs(r.proteinPct), `PROTEIN out of protected band${summary}`).toBeLessThanOrEqual(PROTECTED_PCT);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. G33 — CLOSED by EF4 (Roberto 2026-07-22): every macro gates at ±10%.
//    The same plan that used to be blessed 20% under on fat now flags OUT.
// ═══════════════════════════════════════════════════════════════════════════
describe("G33 — closed: fat drift now bounded by the ±10% macro gate (EF4)", () => {
  test("maint-train/4m: fat ~−20% under → withinTolerance === false (hole closed)", () => {
    const r = reconcile({ label: "maint-train/4m", macros: rx(180, 80, 350, "training"), mealCount: 4 });
    // Fat is materially under target …
    expect(r.fatPct, `expected fat well under target, got ${r.fatPct.toFixed(1)}%`).toBeLessThan(-15);
    // … while the protected pair is fine …
    expect(Math.abs(r.kcalPct)).toBeLessThanOrEqual(PROTECTED_PCT);
    expect(Math.abs(r.proteinPct)).toBeLessThanOrEqual(PROTECTED_PCT);
    // … and EF4 now flags the day honestly.
    expect(r.withinTolerance, "EF4: a −20% fat day must flag fuori tolleranza").toBe(false);
  });

  test("EF4: the flag gates fat when targets are supplied; legacy 2-arg calls stay kcal+protein", () => {
    // 4-arg form: −16 g fat on an 80 g target = −20% → OUT.
    expect(withinReconcileTolerance({ kcal: 0, proteinG: 0, carbsG: 0, fatG: -16 }, 2500, 180, 350, 80)).toBe(false);
    // Legacy 2-arg callers keep their reduced scope (no fat target known).
    expect(withinReconcileTolerance({ kcal: 0, proteinG: 0 }, 2500, 180)).toBe(true);
    // Proof it is not just tolerant of everything: a kcal breach flips it.
    expect(withinReconcileTolerance({ kcal: 200, proteinG: 0 }, 2500, 180)).toBe(false);
  });

  test("fat under-delivery is systematic on 3–4-meal deficit plans, not a one-off", () => {
    // Count grid scenarios whose fat lands >10% under target. Measured: several.
    const under = WIDE_GRID.map(reconcile).filter((r) => r.fatPct < -10);
    expect(under.length, "expected multiple grid scenarios with fat >10% under").toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. PER-MACRO FAT/CARB BOUNDS — Roberto's EF4 ruling. Documented as
//    expected-fail (the naive ±5% interpretation) + todo (the gate that lands
//    with his numbers). NOT asserted green — see the file header.
// ═══════════════════════════════════════════════════════════════════════════
describe("Per-macro fat/carb bounds — EF4-pending (expected-fail + todo)", () => {
  // Expected-fail: if you naively demanded fat ±5% like the protected pair, the
  // worst grid scenario FAILS today at −19.9%. This test PASSES only while that
  // bound is breached — it turns RED (alerting) the day fat comes within ±5%,
  // at which point convert it to a hard assertion under EF4.
  test.fails(
    "naive fat ±5% on maint-train/4m FAILS today (measured −19.9%) — awaiting EF4",
    () => {
      const r = reconcile({ label: "maint-train/4m", macros: rx(180, 80, 350, "training"), mealCount: 4 });
      expect(Math.abs(r.fatPct)).toBeLessThanOrEqual(PROTECTED_PCT);
    }
  );

  test.fails(
    "naive fat ±5% on mod-cut-rest/3m FAILS today (measured −14.2%) — awaiting EF4",
    () => {
      const r = reconcile({ label: "mod-cut-rest/3m", macros: rx(180, 65, 140, "rest"), mealCount: 3 });
      expect(Math.abs(r.fatPct)).toBeLessThanOrEqual(PROTECTED_PCT);
    }
  );

  // Carbs compensate UP when fat drops (kcal-first solving) — measured +8..+14%.
  test.fails(
    "naive carb ±5% on mod-cut-rest/3m FAILS today (carbs compensate up ~+11%) — awaiting EF4",
    () => {
      const r = reconcile({ label: "mod-cut-rest/3m", macros: rx(180, 65, 140, "rest"), mealCount: 3 });
      expect(Math.abs(r.carbPct)).toBeLessThanOrEqual(PROTECTED_PCT);
    }
  );

  // The gates themselves — land when Roberto returns EF4 (HITL-MANIFEST Block C).
  test.todo("EF4: per-day fat bound (e.g. ±10 g) gates generation-time — Roberto's number");
  test.todo("EF4: per-day carb bound (e.g. ±20 g) gates generation-time — Roberto's number");
  test.todo("T1.13 step 3: out-of-tolerance plan blocked with a coach-visible per-macro reason");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. MEASURED-ENVELOPE LOCK — tripwire. Locks the CURRENT fat/carb drift range as
//    the regression seed: if the engine's macro behaviour shifts materially (better
//    OR worse), this breaks and forces a fresh measurement + EF4 re-read.
// ═══════════════════════════════════════════════════════════════════════════
describe("Measured-envelope lock (regression seed, tripwire on engine change)", () => {
  test("worst grid fat drift stays within the measured envelope [−25%, +12%]", () => {
    const fats = WIDE_GRID.map((s) => reconcile(s).fatPct);
    const worstUnder = Math.min(...fats);
    const worstOver = Math.max(...fats);
    // Measured 2026-07-20: worst under −19.9%, worst over +11.6%. Envelope has margin;
    // a breach means the solver's macro trade-offs moved — re-measure before trusting.
    expect(worstUnder, `fat worst-under moved to ${worstUnder.toFixed(1)}%`).toBeGreaterThan(-25);
    expect(worstOver, `fat worst-over moved to ${worstOver.toFixed(1)}%`).toBeLessThan(12);
  });

  test("5-meal configurations reconcile fat best (register: fat within ±4% in most)", () => {
    // Locks the "more meals → better fat reconciliation" property EF4 planning relies on.
    const fiveMeal = WIDE_GRID.filter((s) => s.mealCount === 5).map((s) => Math.abs(reconcile(s).fatPct));
    const threeMeal = WIDE_GRID.filter((s) => s.mealCount === 3).map((s) => Math.abs(reconcile(s).fatPct));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(fiveMeal), "5-meal mean |fat drift| should beat 3-meal").toBeLessThan(mean(threeMeal));
  });

  test("protein reconciles TIGHT grid-wide — worst |drift| ≤ 3% (register: −2.9%)", () => {
    const worstProtein = Math.max(...WIDE_GRID.map((s) => Math.abs(reconcile(s).proteinPct)));
    expect(worstProtein, `protein worst |drift| moved to ${worstProtein.toFixed(1)}%`).toBeLessThanOrEqual(3);
  });
});
