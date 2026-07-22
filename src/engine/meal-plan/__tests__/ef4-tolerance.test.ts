/** EF4 (Roberto 2026-07-22): kcal ±5%, single macro ±10% — closes G33. */
import { describe, test, expect } from "vitest";
import { withinReconcileTolerance, MACRO_TOLERANCE_PCT } from "../reconcile";
import { fibreRatePer1000, fibreTargetG } from "../../hydration";

describe("EF4 tolerance gate", () => {
  const T = { kcal: 2500, p: 160, c: 300, f: 80 };
  test("his exact example: 160 g protein tolerates ±16 g", () => {
    expect(MACRO_TOLERANCE_PCT).toBe(10);
    expect(withinReconcileTolerance({ kcal: 0, proteinG: 16, carbsG: 0, fatG: 0 }, T.kcal, T.p, T.c, T.f)).toBe(true);
    expect(withinReconcileTolerance({ kcal: 0, proteinG: 17, carbsG: 0, fatG: 0 }, T.kcal, T.p, T.c, T.f)).toBe(false);
  });
  test("G33 closed: fat 20% under now flags fuori tolleranza", () => {
    expect(withinReconcileTolerance({ kcal: 0, proteinG: 0, carbsG: 0, fatG: -16 }, T.kcal, T.p, T.c, T.f)).toBe(false);
    expect(withinReconcileTolerance({ kcal: 0, proteinG: 0, carbsG: 0, fatG: -8 }, T.kcal, T.p, T.c, T.f)).toBe(true);
  });
  test("kcal stays at ±5%", () => {
    expect(withinReconcileTolerance({ kcal: 124, proteinG: 0 }, T.kcal, T.p)).toBe(true);
    expect(withinReconcileTolerance({ kcal: 126, proteinG: 0 }, T.kcal, T.p)).toBe(false);
  });
});

describe("N6/N7 fibre band (10–20 g/1000 kcal, inverse to energy)", () => {
  test("anchors and interpolation", () => {
    expect(fibreRatePer1000(1400)).toBe(20);
    expect(fibreRatePer1000(3200)).toBe(10);
    expect(fibreRatePer1000(2250)).toBe(15); // midpoint
  });
  test("absolute daily targets", () => {
    expect(fibreTargetG(1500)).toBe(30);  // 20 × 1.5
    expect(fibreTargetG(3000)).toBe(30);  // 10 × 3.0
    expect(fibreTargetG(2250)).toBe(34);  // 15 × 2.25 = 33.75 → 34
  });
});
