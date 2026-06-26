/**
 * Static supplement library (#23 supplements foundation).
 */

import { describe, test, expect } from "vitest";
import {
  SUPPLEMENT_LIBRARY,
  CORE_SET,
  getSupplement,
  coreSetItems,
} from "../library";

describe("supplement library", () => {
  test("loads all 71 source products", () => {
    expect(SUPPLEMENT_LIBRARY).toHaveLength(71);
  });

  test("every item has a unique id and required fields", () => {
    const ids = new Set<string>();
    for (const s of SUPPLEMENT_LIBRARY) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.name.length).toBeGreaterThan(0);
      expect(typeof s.editableDose).toBe("boolean");
      expect(s.macroCategory.length).toBeGreaterThan(0);
    }
  });

  test("the granular categories collapse to ~12 macro-areas", () => {
    const macros = new Set(SUPPLEMENT_LIBRARY.map((s) => s.macroCategory));
    expect(macros.size).toBe(12);
  });

  test("CORE_SET (4) is present and resolvable", () => {
    expect(CORE_SET).toEqual([
      "whey-protein-isolate",
      "creatine-monohydrate",
      "vitamin-d",
      "complete-multivitamin",
    ]);
    for (const id of CORE_SET) expect(getSupplement(id)).toBeDefined();
    expect(coreSetItems().map((s) => s.id)).toEqual([...CORE_SET]);
  });

  test('the two "Dosage to be specified" rows have an empty dose', () => {
    const emptyDose = SUPPLEMENT_LIBRARY.filter((s) => s.dose === "");
    expect(emptyDose.length).toBe(2);
  });

  test("getSupplement returns undefined for an unknown id", () => {
    expect(getSupplement("not-a-real-supplement")).toBeUndefined();
  });
});
