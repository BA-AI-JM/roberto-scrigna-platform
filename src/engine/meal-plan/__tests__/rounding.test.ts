/**
 * Tests for the practical-rounding helper.
 */

import { describe, it, expect } from "vitest";
import { roundGrams, DEFAULT_ROUNDING } from "../rounding";

describe("roundGrams (default rules: 5 g ≥20, 1 g <20)", () => {
  it("returns 0 for zero / negative / non-finite input", () => {
    expect(roundGrams(0)).toBe(0);
    expect(roundGrams(-5)).toBe(0);
    expect(roundGrams(NaN)).toBe(0);
    expect(roundGrams(Infinity)).toBe(0);
  });

  it("rounds tiny positive amounts up to the smallest step (no disappearing)", () => {
    expect(roundGrams(0.4)).toBe(1);
    expect(roundGrams(0.7)).toBe(1);
  });

  it("rounds ingredients below the threshold to the nearest 1 g", () => {
    expect(roundGrams(8)).toBe(8);
    expect(roundGrams(11)).toBe(11);
    expect(roundGrams(11.4)).toBe(11);
    expect(roundGrams(11.6)).toBe(12);
    expect(roundGrams(19.4)).toBe(19);
    expect(roundGrams(19.6)).toBe(20);
  });

  it("rounds ingredients at or above the threshold to the nearest 5 g", () => {
    expect(roundGrams(20)).toBe(20);
    expect(roundGrams(23)).toBe(25);
    expect(roundGrams(73)).toBe(75);
    expect(roundGrams(93)).toBe(95);
    expect(roundGrams(187)).toBe(185);
    expect(roundGrams(188)).toBe(190);
  });

  it("snaps cleanly when already on a step boundary", () => {
    expect(roundGrams(50)).toBe(50);
    expect(roundGrams(100)).toBe(100);
    expect(roundGrams(15)).toBe(15);
  });

  it("respects custom options when provided", () => {
    expect(
      roundGrams(187, { solidStep: 10, smallThreshold: 20, smallStep: 1 })
    ).toBe(190); // round to nearest 10 g
    expect(
      roundGrams(11.6, { solidStep: 5, smallThreshold: 5, smallStep: 1 })
    ).toBe(10); // 11.6 >= 5 so use the 5-step → round to 10
  });

  it("DEFAULT_ROUNDING exposes the expected constants", () => {
    expect(DEFAULT_ROUNDING.solidStep).toBe(5);
    expect(DEFAULT_ROUNDING.smallThreshold).toBe(20);
    expect(DEFAULT_ROUNDING.smallStep).toBe(1);
  });
});
