import { describe, it, expect } from "vitest";
import {
  SPORT_TAXONOMY,
  sportKeyOf,
  collapsedSportOptions,
  groupedCollapsedSportOptions,
  toCollapsedModality,
  curveKeyForEntry,
  findSportEntry,
} from "../sport-taxonomy";

describe("collapsed sport picker (Ruling 1 — one option per sport)", () => {
  const collapsed = collapsedSportOptions();

  it("exposes exactly one option per distinct sport, no duplicate labels", () => {
    const sportKeys = new Set(SPORT_TAXONOMY.map((e) => sportKeyOf(e.displayIt)));
    expect(collapsed.length).toBe(sportKeys.size);
    expect(new Set(collapsed.map((c) => c.label)).size).toBe(collapsed.length);
  });

  it("every collapsed label is clean (no ' — subtype' suffix)", () => {
    for (const c of collapsed) expect(c.label).not.toContain(" — ");
  });

  it("every representative modality resolves to a real taxonomy entry", () => {
    for (const c of collapsed) {
      expect(findSportEntry(c.modality), c.modality).toBeDefined();
    }
  });

  // THE load-bearing invariant: collapsing must NOT change the calorie math.
  it("all sub-types under a collapsed sport share ONE curve (calorie-safe)", () => {
    const byKey = new Map<string, Set<string>>();
    for (const e of SPORT_TAXONOMY) {
      const key = sportKeyOf(e.displayIt);
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key)!.add(curveKeyForEntry(e));
    }
    for (const [key, curves] of byKey) {
      expect(curves.size, `${key} spans curves: ${[...curves].join(", ")}`).toBe(1);
    }
  });

  it("the representative is the FIRST taxonomy entry of each sport group", () => {
    for (const c of collapsed) {
      const first = SPORT_TAXONOMY.find((e) => sportKeyOf(e.displayIt) === c.label);
      expect(c.modality).toBe(first!.displayIt);
    }
  });
});

describe("groupedCollapsedSportOptions — grouping for the picker", () => {
  it("covers every collapsed option across the groups, none lost or duplicated", () => {
    const grouped = groupedCollapsedSportOptions();
    const flat = grouped.flatMap((g) => g.entries);
    expect(flat.length).toBe(collapsedSportOptions().length);
    for (const g of grouped) {
      for (const e of g.entries) expect(e.group).toBe(g.group);
    }
  });
});

describe("toCollapsedModality — legacy sub-type → representative", () => {
  it("maps a stored sub-type to its collapsed representative", () => {
    const rep = toCollapsedModality("BJJ — Sparring");
    expect(sportKeyOf(rep)).toBe("BJJ");
    expect(findSportEntry(rep)).toBeDefined();
    expect(collapsedSportOptions().some((c) => c.modality === rep)).toBe(true);
  });

  it("leaves a representative unchanged", () => {
    const rep = collapsedSportOptions()[0]!.modality;
    expect(toCollapsedModality(rep)).toBe(rep);
  });

  it("passes an unknown string through, and empty → ''", () => {
    expect(toCollapsedModality("Quidditch")).toBe("Quidditch");
    expect(toCollapsedModality(undefined)).toBe("");
    expect(toCollapsedModality(null)).toBe("");
  });
});

describe("sportKeyOf", () => {
  it("strips the ' — subtype' suffix, keeps names without one", () => {
    expect(sportKeyOf("BJJ — Classe")).toBe("BJJ");
    expect(sportKeyOf("Corsa — Intervalli / Tempo")).toBe("Corsa");
    expect(sportKeyOf("Judo")).toBe("Judo");
    expect(sportKeyOf("Calisthenics / Corpo libero")).toBe("Calisthenics / Corpo libero");
  });
});
