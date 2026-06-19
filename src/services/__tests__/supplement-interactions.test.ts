/**
 * Tests for the supplement-interaction warning detector.
 */

import { describe, it, expect } from "vitest";
import { checkSupplementInteractions } from "../supplements";
import type { SupplementEntry } from "../../pdf/types";

function entry(name: string, dosage = "1g/die"): SupplementEntry {
  return { name, dosage, timing: "", rationale: "" };
}

describe("checkSupplementInteractions", () => {
  it("returns an empty array for a benign protocol", () => {
    expect(checkSupplementInteractions([entry("Proteine Whey Isolate")])).toEqual([]);
    expect(checkSupplementInteractions([])).toEqual([]);
  });

  it("flags Ferro + Calcio with a timing warning", () => {
    const out = checkSupplementInteractions([
      entry("Ferro bisglicinato"),
      entry("Calcio carbonato"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("warning");
    expect(out[0]!.message).toMatch(/2 ore/);
  });

  it("flags Caffeina + Magnesio as a timing info note", () => {
    const out = checkSupplementInteractions([
      entry("Caffeina"),
      entry("Magnesio (bisglicinato)"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("info");
  });

  it("flags Omega-3 above 3 g/die as a clinical warning", () => {
    const high = checkSupplementInteractions([entry("Omega-3 (EPA/DHA)", "3-5g/die")]);
    expect(high).toHaveLength(1);
    expect(high[0]!.severity).toBe("warning");
    expect(high[0]!.message).toMatch(/anti-aggregante/);
  });

  it("does NOT flag Omega-3 at 1-2 g/die", () => {
    const safe = checkSupplementInteractions([entry("Omega-3 (EPA/DHA)", "1-2g/die")]);
    expect(safe).toEqual([]);
  });

  it("suggests Vitamina K2 when Vitamina D is present without K", () => {
    const out = checkSupplementInteractions([entry("Vitamina D3", "2000UI/die")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("synergy");
    expect(out[0]!.message).toMatch(/K2/);
  });

  it("does NOT suggest K2 when both D and K are already present", () => {
    const out = checkSupplementInteractions([
      entry("Vitamina D3"),
      entry("Vitamina K2 (MK-7)"),
    ]);
    expect(out).toEqual([]);
  });

  it("stacks multiple notes when multiple interactions apply", () => {
    const out = checkSupplementInteractions([
      entry("Ferro bisglicinato"),
      entry("Calcio carbonato"),
      entry("Caffeina"),
      entry("Magnesio (bisglicinato)"),
      entry("Vitamina D3"),
      entry("Omega-3 (EPA/DHA)", "4g/die"),
    ]);
    expect(out.length).toBeGreaterThanOrEqual(4);
    const severities = out.map((n) => n.severity);
    expect(severities).toContain("warning");
    expect(severities).toContain("info");
    expect(severities).toContain("synergy");
  });
});
