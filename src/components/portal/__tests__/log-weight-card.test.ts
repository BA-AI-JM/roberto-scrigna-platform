import { describe, test, expect } from "vitest";
import { validateWeightInput, parseDecimal } from "../log-weight-form";

describe("parseDecimal", () => {
  test("parses dot and comma decimals; blank/invalid → null", () => {
    expect(parseDecimal("78.5")).toBe(78.5);
    expect(parseDecimal("78,5")).toBe(78.5);
    expect(parseDecimal("  80 ")).toBe(80);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });
});

describe("validateWeightInput — empty weight is rejected", () => {
  test("blank weight → not ok", () => {
    const r = validateWeightInput("", "", "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/peso valido/i);
  });
  test("whitespace weight → not ok", () => {
    expect(validateWeightInput("   ", "", "").ok).toBe(false);
  });
  test("non-numeric weight → not ok", () => {
    expect(validateWeightInput("abc", "", "").ok).toBe(false);
  });
  test("out-of-range weight → not ok", () => {
    expect(validateWeightInput("10", "", "").ok).toBe(false);
    expect(validateWeightInput("400", "", "").ok).toBe(false);
  });
});

describe("validateWeightInput — valid input builds the addSnapshot payload", () => {
  test("weight only", () => {
    const r = validateWeightInput("78.5", "", "");
    expect(r).toEqual({ ok: true, payload: { weightKg: 78.5 } });
  });
  test("comma decimal normalised", () => {
    const r = validateWeightInput("78,5", "", "");
    expect(r.ok && r.payload.weightKg).toBe(78.5);
  });
  test("with body-fat and note", () => {
    const r = validateWeightInput("80", "18", "  al mattino  ");
    expect(r).toEqual({
      ok: true,
      payload: { weightKg: 80, bodyFatPct: 18, notes: "al mattino" },
    });
  });
  test("blank body-fat / note are omitted from the payload", () => {
    const r = validateWeightInput("80", "  ", "");
    expect(r.ok && "bodyFatPct" in r.payload).toBe(false);
    expect(r.ok && "notes" in r.payload).toBe(false);
  });
  test("out-of-range body-fat → not ok", () => {
    expect(validateWeightInput("80", "70", "").ok).toBe(false);
    expect(validateWeightInput("80", "1", "").ok).toBe(false);
  });
});
