/**
 * B2 (#9) — Roberto's carb-led tier rule, golden-fixtured from his answers
 * (2026-07-21): "+350 kcal ≈ 100 g pasta ≈ ~70 g carbs, 10–15 g protein,
 * 1–2 g fat"; engine applies + signals; absolute overrides bypass.
 */
import { describe, test, expect } from "vitest";
import {
  applyCarbLedTierRule,
  carbLedAssumptionLines,
  CEREAL_PROTEIN_G_PER_KCAL,
  CEREAL_FAT_G_PER_KCAL,
} from "../carb-led-tiers";
import type { DayType } from "../types";

const day = (dayType: DayType, totalKcal: number, p: number, f: number, c: number) => ({
  dayType,
  macros: { totalKcal, proteinG: p, fatG: f, carbG: c },
});

describe("applyCarbLedTierRule — Roberto's golden example", () => {
  test("+350 kcal tier step allocates ≈ +12.5 P / +1.5 F / ~71.6 C (his 'circa 70')", () => {
    // Anchor tier: 2800 kcal — P 208 / F 81 / C ~309 (kcal-consistent: 2797).
    // Higher tier: same params today → pure-carb delta (C +87.5). The rule
    // reshapes that delta to cereal composition.
    const days = [
      day("training_light", 2800, 208, 81, 309.8),
      day("training_medium", 3150, 208, 81, 397.3), // +350, all carbs today
      day("rest", 2400, 183, 90, 214.5),
    ];
    const adj = applyCarbLedTierRule(days);
    expect(adj).toHaveLength(1);
    const a = adj[0]!;
    expect(a.dayType).toBe("training_medium");
    expect(a.deltaKcal).toBe(350);
    expect(a.proteinAfterG).toBeCloseTo(208 + 12.5, 1);
    expect(a.fatAfterG).toBeCloseTo(81 + 1.5, 1);
    // carbs absorb the exact remainder: (3150 − 4·220.5 − 9·82.5)/4
    expect(a.carbAfterG).toBeCloseTo((3150 - 220.5 * 4 - 82.5 * 9) / 4, 1);
    // his "circa 70g" of added carbs vs the anchor:
    expect(a.carbAfterG - days[0]!.macros.carbG).toBeCloseTo(71.6, 0);
    // kcal identity preserved
    const kcal = a.proteinAfterG * 4 + a.fatAfterG * 9 + a.carbAfterG * 4;
    expect(kcal).toBeCloseTo(3150, 0);
    // days mutated in place (engine applies it itself — his N4)
    expect(days[1]!.macros.proteinG).toBe(a.proteinAfterG);
  });

  test("rest/refeed/deload are never touched; anchor day is never touched", () => {
    const days = [
      day("rest", 2400, 183, 90, 214.5),
      day("training", 2800, 208, 81, 309.8),
      day("training", 2800, 208, 81, 309.8),
    ];
    expect(applyCarbLedTierRule(days)).toHaveLength(0);
    expect(days[0]!.macros.fatG).toBe(90);
  });

  test("a coach absolute override on the day type bypasses the rule (his manual override)", () => {
    const days = [
      day("training_light", 2800, 208, 81, 309.8),
      day("training_intense", 3300, 208, 81, 434.8),
    ];
    const adj = applyCarbLedTierRule(days, { training_intense: { carbG: 400 } });
    expect(adj).toHaveLength(0);
    expect(days[1]!.macros.carbG).toBe(434.8);
  });

  test("fat can never lead a tier delta (the original #9 complaint)", () => {
    const days = [
      day("training_light", 2600, 200, 80, 250),
      day("training_medium", 2950, 200, 95, 253.8), // fat-heavy delta (the bug he saw)
    ];
    const adj = applyCarbLedTierRule(days);
    expect(adj).toHaveLength(1);
    const a = adj[0]!;
    const fatDeltaKcal = (a.fatAfterG - 80) * 9;
    const carbDeltaKcal = (a.carbAfterG - 250) * 4;
    expect(a.fatAfterG).toBeCloseTo(80 + 350 * CEREAL_FAT_G_PER_KCAL, 1);
    expect(carbDeltaKcal).toBeGreaterThan(fatDeltaKcal * 10);
  });

  test("signal lines name the before→after numbers and the override escape hatch", () => {
    const lines = carbLedAssumptionLines([
      {
        dayIndex: 1, dayType: "training_medium", deltaKcal: 350,
        proteinBeforeG: 208, proteinAfterG: 220.5,
        fatBeforeG: 81, fatAfterG: 82.5,
        carbBeforeG: 397.3, carbAfterG: 381.4,
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Regola cereali");
    expect(lines[0]).toContain("P 208→220.5");
    expect(lines[0]).toContain("override");
  });

  test("composition constants match his reference food (per 350 kcal)", () => {
    expect(350 * CEREAL_PROTEIN_G_PER_KCAL).toBeCloseTo(12.5, 5);
    expect(350 * CEREAL_FAT_G_PER_KCAL).toBeCloseTo(1.5, 5);
  });
});
