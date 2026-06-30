import { describe, test, expect } from "vitest";
import { parseOverrideInput, overrideErrorMessage, MAX_OVERRIDE_KCAL } from "../override-validation";

describe("parseOverrideInput", () => {
  test("empty / whitespace → clear (value null, no error)", () => {
    expect(parseOverrideInput("")).toEqual({ value: null, error: null });
    expect(parseOverrideInput("   ")).toEqual({ value: null, error: null });
  });
  test("valid positive integer", () => {
    expect(parseOverrideInput("350")).toEqual({ value: 350, error: null });
  });
  test("rejects non-positive, non-integer, and out-of-range", () => {
    expect(parseOverrideInput("0").error).toMatch(/positivo/);
    expect(parseOverrideInput("-5").error).toMatch(/positivo/);
    expect(parseOverrideInput("3.5").error).toMatch(/intero/);
    expect(parseOverrideInput(String(MAX_OVERRIDE_KCAL + 1)).error).toMatch(/troppo alto/);
  });
});

describe("overrideErrorMessage", () => {
  test("maps codes", () => {
    expect(overrideErrorMessage("FORBIDDEN")).toMatch(/permesso/i);
    expect(overrideErrorMessage("BAD_REQUEST")).toMatch(/non valido/i);
    expect(overrideErrorMessage("X")).toMatch(/non riuscito/i);
  });
});
