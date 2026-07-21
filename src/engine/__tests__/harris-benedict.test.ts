/** D4 (R1) — Harris-Benedict fallback + manual BF% priority (Roberto 2026-07-21). */
import { describe, test, expect } from "vitest";
import { calculateBmr, harrisBenedictBmr } from "../bmr";
import { estimateBodyFat } from "../body-fat";
import type { ClientSnapshot } from "../types";

const BASE: ClientSnapshot = {
  weightKg: 80, heightCm: 180, ageYears: 30, sex: "male",
  weekSchedule: ["training","rest","training","rest","training","rest","rest"],
} as ClientSnapshot;

describe("D4 — BMR without body composition", () => {
  test("no measurements → Harris-Benedict, not Katch-on-invented-LBM (Florian case)", () => {
    const bf = estimateBodyFat(BASE);
    expect(bf.method).toBe("heuristic");
    const bmr = calculateBmr(bf, { weightKg: 80, heightCm: 180, ageYears: 30, sex: "male" });
    expect(bmr.formula).toBe("harris-benedict");
    // 88.362 + 13.397·80 + 4.799·180 − 5.677·30 = 1853.63 → 1854
    expect(bmr.bmrKcal).toBe(1854);
  });

  test("manual BF% (method override) → Katch-McArdle on the STATED composition", () => {
    const bf = estimateBodyFat({ ...BASE, bodyFatPctOverride: 15 });
    expect(bf.method).toBe("override");
    const bmr = calculateBmr(bf, { weightKg: 80, heightCm: 180, ageYears: 30, sex: "male" });
    expect(bmr.formula).toBe("katch-mcardle");
    expect(bmr.bmrKcal).toBe(Math.round(370 + 21.6 * 80 * 0.85)); // LBM 68 → 1839
  });

  test("female Harris-Benedict coefficients", () => {
    expect(harrisBenedictBmr({ weightKg: 60, heightCm: 165, ageYears: 28, sex: "female" })).toBe(
      Math.round(447.593 + 9.247 * 60 + 3.098 * 165 - 4.33 * 28)
    );
  });
});
