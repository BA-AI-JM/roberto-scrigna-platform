/**
 * T1.13 step-1b — reconciliation sweep under deficit/template pressure.
 * Runs the REAL solver (createMealPlan) across cutting-style prescriptions and
 * reports delivered-vs-prescribed divergence per macro. Read-only; no DB.
 * Run: bun run docs/polish/baseline-sweep/t113-deficit-sweep.ts
 */
import { createMealPlan } from "../../../src/engine/meal-plan/planner";
import { ALL_TEMPLATES } from "../../../src/data/meals/templates";
import type { MacroTargets } from "../../../src/engine/types";

const rx = (proteinG: number, fatG: number, carbG: number, dayType: MacroTargets["dayType"]): MacroTargets =>
  ({ proteinG, fatG, carbG, totalKcal: proteinG * 4 + carbG * 4 + fatG * 9, dayType });

// Grid: maintenance → moderate cut → hard cut → contest-prep style, at 3/4/5 meals.
const SCENARIOS: { label: string; t: MacroTargets; meals: number }[] = [];
for (const [label, p, f, c, day] of [
  ["maint-train", 180, 80, 350, "training"],
  ["mod-cut-train", 180, 60, 220, "training"],
  ["mod-cut-rest", 180, 65, 140, "rest"],
  ["hard-cut-train", 175, 50, 150, "training"],
  ["hard-cut-rest", 175, 50, 90, "rest"],
  ["prep-train", 170, 45, 110, "training"],
  ["prep-rest", 165, 40, 70, "rest"],
  ["roberto-case", 165, 55, 130, "rest"], // ~pt2 Item-21 territory: 160-170g P prescription
] as const) {
  for (const meals of [3, 4, 5]) SCENARIOS.push({ label: `${label}/${meals}m`, t: rx(p, f, c, day), meals });
}

const rows: { label: string; dP: number; dF: number; dC: number; dK: number; pAbs: number }[] = [];
for (const s of SCENARIOS) {
  try {
    const plan: any = createMealPlan(ALL_TEMPLATES, { dayType: s.t.dayType, macroTargets: s.t, mealCount: s.meals } as any);
    const a = plan.actualMacros ?? plan.totals ?? {};
    const num = (o: any, ...k: string[]) => k.reduce((v, kk) => (typeof o?.[kk] === "number" ? o[kk] : v), 0);
    const [aP, aF, aC, aK] = [num(a, "proteinG"), num(a, "fatG"), num(a, "carbsG", "carbG"), num(a, "kcal", "totalKcal")];
    const pct = (av: number, tv: number) => (tv ? ((av - tv) / tv) * 100 : 0);
    rows.push({ label: s.label, dP: pct(aP, s.t.proteinG), dF: pct(aF, s.t.fatG), dC: pct(aC, s.t.carbG), dK: pct(aK, s.t.totalKcal), pAbs: aP - s.t.proteinG });
  } catch (e) {
    rows.push({ label: s.label + " ERR:" + String(e).slice(0, 40), dP: NaN, dF: NaN, dC: NaN, dK: NaN, pAbs: NaN });
  }
}

console.log(`${"scenario".padEnd(20)}${"ΔP%".padStart(8)}${"ΔP g".padStart(8)}${"ΔF%".padStart(8)}${"ΔC%".padStart(8)}${"Δkcal%".padStart(9)}`);
for (const r of rows) console.log(`${r.label.padEnd(20)}${r.dP.toFixed(1).padStart(8)}${r.pAbs.toFixed(0).padStart(8)}${r.dF.toFixed(1).padStart(8)}${r.dC.toFixed(1).padStart(8)}${r.dK.toFixed(1).padStart(9)}`);

const worstP = rows.reduce((m, r) => (Math.abs(r.dP) > Math.abs(m.dP) ? r : m));
const worstF = rows.reduce((m, r) => (Math.abs(r.dF) > Math.abs(m.dF) ? r : m));
console.log(`\nWORST protein: ${worstP.label} ${worstP.dP.toFixed(1)}% (${worstP.pAbs.toFixed(0)}g abs)`);
console.log(`WORST fat:     ${worstF.label} ${worstF.dF.toFixed(1)}%`);
console.log(`Item-21 (+60% protein) ${Math.abs(worstP.dP) > 30 ? "REPRODUCED-CLASS divergence found" : "still not reproduced at engine level → strengthens hyp.2 (display/day-type mismatch) or needs Roberto's exact client params"}`);
