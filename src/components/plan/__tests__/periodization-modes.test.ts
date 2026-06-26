/**
 * #17 Stage B — periodization mode presets + the 4-mode selector.
 * (Day-type label exhaustiveness is type-enforced by Record<DayType,string> in
 * the page, so "no blank tier labels" is guaranteed at compile time.)
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  PERIODIZATION_MODES,
  activeModeId,
} from "../periodization-modes";
import { PeriodizationModeSelector } from "../periodization-mode-selector";
import type { DayType } from "../../../engine/types";

describe("PERIODIZATION_MODES", () => {
  test("exposes exactly four modes, each a 7-day schedule", () => {
    expect(PERIODIZATION_MODES).toHaveLength(4);
    for (const m of PERIODIZATION_MODES) expect(m.schedule).toHaveLength(7);
  });

  test("mode 1 = weekly average (training ×7)", () => {
    expect(PERIODIZATION_MODES[0]!.schedule).toEqual(Array(7).fill("training"));
  });

  test("mode 2 = training / rest split (both present, no tiers)", () => {
    const s = PERIODIZATION_MODES[1]!.schedule;
    expect(s).toContain("training");
    expect(s).toContain("rest");
    expect(s.some((d) => d.startsWith("training_"))).toBe(false);
  });

  test("mode 3 = rest + medium + intense tiers only", () => {
    expect(new Set(PERIODIZATION_MODES[2]!.schedule)).toEqual(
      new Set<DayType>(["rest", "training_medium", "training_intense"])
    );
  });

  test("mode 4 = rest + all four intensity tiers", () => {
    expect(new Set(PERIODIZATION_MODES[3]!.schedule)).toEqual(
      new Set<DayType>([
        "rest",
        "training_light",
        "training_medium",
        "training_intense",
        "training_double",
      ])
    );
  });
});

describe("activeModeId", () => {
  test("matches a mode whose schedule equals the week, null when fine-tuned/empty", () => {
    expect(activeModeId(PERIODIZATION_MODES[0]!.schedule)).toBe("weekly-average");
    expect(activeModeId(PERIODIZATION_MODES[2]!.schedule)).toBe("off-medium-intense");
    expect(activeModeId(["training", "rest", "rest", "rest", "rest", "rest", "rest"])).toBeNull();
    expect(activeModeId([])).toBeNull();
    expect(activeModeId(null)).toBeNull();
  });
});

describe("PeriodizationModeSelector render", () => {
  test("renders all four numbered mode labels", () => {
    const html = renderToStaticMarkup(
      createElement(PeriodizationModeSelector, {
        weekSchedule: PERIODIZATION_MODES[0]!.schedule,
        onSelect: () => {},
        labelStyle: {},
      })
    );
    expect(html).toContain("Modalità di periodizzazione");
    expect(html).toContain("1 · Media settimanale");
    expect(html).toContain("2 · Allenamento / riposo");
    expect(html).toContain("3 · OFF / medio / intenso");
    expect(html).toContain("4 · OFF / leggero / medio / intenso / doppia");
  });

  test("marks the active mode as pressed", () => {
    const html = renderToStaticMarkup(
      createElement(PeriodizationModeSelector, {
        weekSchedule: PERIODIZATION_MODES[3]!.schedule,
        onSelect: () => {},
        labelStyle: {},
      })
    );
    expect(html).toContain('aria-pressed="true"');
  });
});
