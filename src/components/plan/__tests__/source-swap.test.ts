/**
 * #16b source-swap card — payload helpers + render smoke.
 *
 * The wizard runs in a node-only vitest env (no DOM), so interactive Select
 * behaviour isn't mounted; the selection→payload contract is covered by the pure
 * `buildSourcePinsPayload` helper (the exact value threaded into previewWeek +
 * generate), and the render test asserts the categories render without throwing.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SourceSwapCard, type FoodCatalogue } from "../source-swap-card";
import {
  buildSourcePinsPayload,
  hasAnyPin,
  EMPTY_SELECTIONS,
  AUTO_VALUE,
  PINNABLE_CATEGORIES,
} from "../source-swap-helpers";
import type { DayType } from "../../../engine/types";

const CATALOGUE: FoodCatalogue = {
  PROTEIN: [
    { foodId: "petto-pollo", name: "Chicken breast (raw)" },
    { foodId: "fiocchi-di-latte", name: "Cottage cheese low-fat" },
  ],
  CARB: [{ foodId: "riso-basmati", name: "Basmati rice (dry)" }],
  FAT: [{ foodId: "olio-evo", name: "Olive oil" }],
  VEG: [{ foodId: "broccoli", name: "Broccoli (raw)" }],
  FRUIT: [{ foodId: "banana", name: "Banana (peeled)" }],
};

const PRESENT: DayType[] = ["training", "rest"];

describe("buildSourcePinsPayload — selection → payload", () => {
  test("all Automatico (empty) → undefined (no sourcePins sent)", () => {
    expect(buildSourcePinsPayload(EMPTY_SELECTIONS, PRESENT)).toBeUndefined();
  });

  test("the AUTO sentinel is treated as no-pin", () => {
    const sel = { ...EMPTY_SELECTIONS, PROTEIN: AUTO_VALUE };
    expect(buildSourcePinsPayload(sel, PRESENT)).toBeUndefined();
  });

  test("selecting a food pins that category on every present day-type (global)", () => {
    const sel = { ...EMPTY_SELECTIONS, PROTEIN: "petto-pollo" };
    expect(buildSourcePinsPayload(sel, PRESENT)).toEqual({
      training: { PROTEIN: { foodId: "petto-pollo" } },
      rest: { PROTEIN: { foodId: "petto-pollo" } },
    });
  });

  test("multiple categories pin together", () => {
    const sel = { ...EMPTY_SELECTIONS, PROTEIN: "petto-pollo", CARB: "riso-basmati" };
    expect(buildSourcePinsPayload(sel, ["rest"])).toEqual({
      rest: { PROTEIN: { foodId: "petto-pollo" }, CARB: { foodId: "riso-basmati" } },
    });
  });

  test("clearing a category back to Automatico drops only that pin", () => {
    const pinned = { ...EMPTY_SELECTIONS, PROTEIN: "petto-pollo", FAT: "olio-evo" };
    const cleared = { ...pinned, PROTEIN: "" };
    expect(buildSourcePinsPayload(cleared, ["rest"])).toEqual({
      rest: { FAT: { foodId: "olio-evo" } },
    });
  });

  test("no present day-types → undefined (nothing to apply pins to)", () => {
    const sel = { ...EMPTY_SELECTIONS, PROTEIN: "petto-pollo" };
    expect(buildSourcePinsPayload(sel, [])).toBeUndefined();
  });

  test("duplicate day-types in the schedule collapse to one key each", () => {
    const sel = { ...EMPTY_SELECTIONS, VEG: "broccoli" };
    const out = buildSourcePinsPayload(sel, ["training", "training", "rest"]);
    expect(Object.keys(out ?? {}).sort()).toEqual(["rest", "training"]);
  });
});

describe("hasAnyPin", () => {
  test("false for all-Automatico, true once a real food is set", () => {
    expect(hasAnyPin(EMPTY_SELECTIONS)).toBe(false);
    expect(hasAnyPin({ ...EMPTY_SELECTIONS, FRUIT: AUTO_VALUE })).toBe(false);
    expect(hasAnyPin({ ...EMPTY_SELECTIONS, FRUIT: "banana" })).toBe(true);
  });
});

describe("SourceSwapCard render (categories from a mocked catalogue)", () => {
  test("renders all five Italian category labels + the Automatico default, no throw", () => {
    const html = renderToStaticMarkup(
      createElement(SourceSwapCard, {
        catalogue: CATALOGUE,
        selections: EMPTY_SELECTIONS,
        onChange: () => {},
        sectionStyle: {},
      })
    );
    for (const { label } of PINNABLE_CATEGORIES) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Scegli la fonte per categoria");
    expect(html).toContain("Automatico");
  });

  test("renders without throwing when the catalogue is still loading (undefined)", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(SourceSwapCard, {
          catalogue: undefined,
          selections: EMPTY_SELECTIONS,
          onChange: () => {},
          sectionStyle: {},
        })
      )
    ).not.toThrow();
  });
});
