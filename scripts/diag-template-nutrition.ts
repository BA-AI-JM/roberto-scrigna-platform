/**
 * DIAGNOSTIC (read-only, NOT wired into generation) — #food-enrichment Stage 1.
 *
 * For each of the 26 ALL_TEMPLATES, sums per-ingredient nutrition from the v3
 * food DB (resolveFood(foodId) × grams/100) and compares it to the template's
 * stated aggregate macros. Prints the per-macro delta + %drift, the computed
 * fibre/sodium (which the templates don't carry), and how many ingredients
 * resolved via "sub" / "zero".
 *
 * Purpose: quantify mapping quality and reveal whether the template aggregates
 * were derived from real food data — the go/no-go for Stage 2's per-ingredient
 * rewrite. It asserts nothing and changes nothing.
 *
 * Run: bun run scripts/diag-template-nutrition.ts
 */

import { ALL_TEMPLATES } from "../src/data/meals/templates";
import { resolveFood, FOOD_MAP } from "../src/data/meals/food-map";

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padL(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
function cell(computed: number, stated: number): string {
  const dv = computed - stated;
  const pct = stated ? (dv / stated) * 100 : 0;
  const sign = pct >= 0 ? "+" : "";
  return padL(`${computed.toFixed(0)}/${stated.toFixed(0)}(${sign}${pct.toFixed(0)}%)`, 14);
}

console.log(
  `${pad("id", 10)} ${padL("kcal", 14)} ${padL("protein", 14)} ${padL("carbs", 14)} ${padL("fat", 14)} | ${padL("fibre", 6)} ${padL("Na(mg)", 8)} | sub/zero`
);
console.log("-".repeat(96));

for (const t of ALL_TEMPLATES) {
  let ck = 0, cp = 0, cc = 0, cf = 0, cfib = 0, cna = 0, nsub = 0, nzero = 0;
  for (const ing of t.ingredients) {
    const r = resolveFood(ing.foodId);
    const g = ing.grams / 100;
    ck += r.kcal * g;
    cp += r.proteinG * g;
    cc += r.carbsG * g;
    cf += r.fatG * g;
    cfib += r.fibreG * g;
    cna += r.sodiumMg * g;
    if (r.via === "sub") nsub++;
    else if (r.via === "zero") nzero++;
  }
  console.log(
    `${pad(t.id, 10)} ${cell(ck, t.kcalPerServing)} ${cell(cp, t.proteinG)} ${cell(cc, t.carbsG)} ${cell(cf, t.fatG)} | ${padL(cfib.toFixed(1), 6)} ${padL(cna.toFixed(0), 8)} | ${nsub}/${nzero}`
  );
}

// Aggregate mapping coverage line.
const distinct = [...new Set(ALL_TEMPLATES.flatMap((t) => t.ingredients.map((i) => i.foodId)))];
const subCount = distinct.filter((id) => FOOD_MAP[id]?.via === "sub").length;
const zeroCount = distinct.filter((id) => FOOD_MAP[id]?.via === "zero").length;
const exactCount = distinct.filter((id) => FOOD_MAP[id]?.via === "exact").length;
console.log(
  `\n${distinct.length} distinct foodIds — exact ${exactCount} / sub ${subCount} / zero ${zeroCount}`
);
