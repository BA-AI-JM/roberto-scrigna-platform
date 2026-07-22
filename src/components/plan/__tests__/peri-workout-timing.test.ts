/**
 * #18 nutrient timing — peri-workout helpers + card.
 *
 * The timed session box + pre/intra/post grouping is DISPLAY-ONLY. These cover
 * the pure model (gating on training day + a set time, slot→pre/post mapping,
 * clock formatting, representative-time pick) and the rendered card (node SSR).
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  buildPeriWorkout,
  formatSessionClock,
  isTrainingDayType,
  firstTrainingTime,
  periSlot,
  type SlotLite,
} from "../peri-workout-timing";
import { PeriWorkoutTimingCard } from "../peri-workout-timing-card";

const SLOTS: SlotLite[] = [
  { slot: "breakfast", mealName: "Colazione" },
  { slot: "snack_2", mealName: "Spuntino pre" },
  { slot: "post_workout", mealName: "Frullato Proteico" },
  { slot: "dinner", mealName: "Cena" },
];

describe("pure helpers (#18)", () => {
  test("formatSessionClock: start+end, start-only, none", () => {
    expect(formatSessionClock("18:00", "19:30")).toBe("18:00–19:30");
    expect(formatSessionClock("18:00")).toBe("18:00");
    expect(formatSessionClock(undefined, "19:30")).toBeNull();
  });

  test("isTrainingDayType covers base + #17 tiers, excludes rest/refeed/deload", () => {
    expect(isTrainingDayType("training")).toBe(true);
    expect(isTrainingDayType("training_intense")).toBe(true);
    expect(isTrainingDayType("rest")).toBe(false);
    expect(isTrainingDayType("refeed")).toBe(false);
    expect(isTrainingDayType("deload")).toBe(false);
  });

  test("firstTrainingTime returns the first session (Mon→Sun) carrying a startTime", () => {
    const byDay = {
      "0": [{ duration_min: 60 }], // no startTime
      "2": [{ duration_min: 90, startTime: "18:00", endTime: "19:30" }],
    };
    expect(firstTrainingTime(byDay)).toEqual({ startTime: "18:00", endTime: "19:30" });
    expect(firstTrainingTime(undefined)).toEqual({});
    expect(firstTrainingTime({ "0": [{ duration_min: 60 }] })).toEqual({});
  });

  test("periSlot maps post_workout and a pre slot (snack_2 fallback)", () => {
    expect(periSlot(SLOTS, "post")?.slot).toBe("post_workout");
    expect(periSlot(SLOTS, "pre")?.slot).toBe("snack_2");
    expect(periSlot([{ slot: "breakfast" }, { slot: "dinner" }], "post")).toBeUndefined();
  });
});

describe("buildPeriWorkout model (#18)", () => {
  test("training day + time → show, clock, pre/post meals", () => {
    const m = buildPeriWorkout("training", SLOTS, { startTime: "18:00", endTime: "19:30" });
    expect(m.show).toBe(true);
    expect(m.clock).toBe("18:00–19:30");
    expect(m.preMeal).toBe("Spuntino pre");
    expect(m.postMeal).toBe("Frullato Proteico");
  });

  test("R9: training day with NO time → shown as plain guidance (clock null)", () => {
    const m = buildPeriWorkout("training", SLOTS, {});
    expect(m.show).toBe(true);
    expect(m.clock).toBe(null);
    expect(buildPeriWorkout("training_medium", SLOTS, undefined).show).toBe(true);
  });

  test("non-training day even WITH a time → hidden", () => {
    expect(buildPeriWorkout("rest", SLOTS, { startTime: "18:00" }).show).toBe(false);
  });
});

describe("PeriWorkoutTimingCard render (#18)", () => {
  test("renders the timed box, the three sections, the post meal, and intra prose", () => {
    const html = renderToStaticMarkup(
      createElement(PeriWorkoutTimingCard, { dayType: "training", slots: SLOTS, startTime: "18:00", endTime: "19:30" })
    );
    expect(html).toContain("Allenamento 18:00–19:30");
    expect(html).toContain("Pre-allenamento");
    expect(html).toContain("Intra-allenamento");
    expect(html).toContain("Post-allenamento");
    expect(html).toContain("Frullato Proteico"); // post meal grouped in
    expect(html).toContain("Acqua a piccoli sorsi"); // R9: intra names water
    expect(html).toContain("carboidrati semplici + elettroliti"); // >90-min addition
    expect(html).toContain("120–150% del peso perso"); // R9: post water rule
  });

  test("R9: no training time → plain 'Allenamento' box, no clock", () => {
    const html = renderToStaticMarkup(
      createElement(PeriWorkoutTimingCard, { dayType: "training", slots: SLOTS })
    );
    expect(html).toContain('data-testid="peri-workout-timing"');
    expect(html).toContain(">Allenamento<");
    expect(html).not.toContain("Allenamento undefined");
  });

  test("non-training day → renders nothing", () => {
    const html = renderToStaticMarkup(
      createElement(PeriWorkoutTimingCard, { dayType: "rest", slots: SLOTS, startTime: "18:00" })
    );
    expect(html).toBe("");
  });
});
