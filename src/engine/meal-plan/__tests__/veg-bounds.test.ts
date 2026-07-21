/** D3b (R8) — veggie portion dignity: min 100 g, ceiling 400 g (⚠ pending 500 confirm). */
import { describe, test, expect } from "vitest";
import { ABS_BOUNDS } from "../solver";

describe("VEG category bounds (R8)", () => {
  test("min 100 g / max 400 g — Roberto's rule, conservative ceiling", () => {
    expect(ABS_BOUNDS.VEG).toEqual([100, 400]);
  });
});
