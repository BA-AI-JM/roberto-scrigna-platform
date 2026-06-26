/**
 * #27 Stage 2 — food diary: pure helpers + entry-list render.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  sumDayTotals,
  shiftDateISO,
  mealSlotLabel,
  type DiaryEntry,
} from "../diary-helpers";
import { DiaryEntryList } from "../diary-entry-list";

const ENTRIES: DiaryEntry[] = [
  {
    id: "d1",
    meal_slot: "breakfast",
    food_items: [{ name: "Avena", grams: 80, kcal: 300, protein: 10, carbs: 50, fat: 6 }],
    total_kcal: 300,
    total_protein_g: 10,
    total_carbs_g: 50,
    total_fat_g: 6,
    notes: null,
    created_at: "2026-06-23T08:00:00Z",
  },
  {
    id: "d2",
    meal_slot: "lunch",
    food_items: [{ name: "Pollo", grams: 200, kcal: 330, protein: 60, carbs: 0, fat: 8 }],
    total_kcal: 330,
    total_protein_g: 60,
    total_carbs_g: 0,
    total_fat_g: 8,
    notes: null,
    created_at: "2026-06-23T13:00:00Z",
  },
];

describe("diary helpers", () => {
  test("sumDayTotals adds stored entry totals", () => {
    expect(sumDayTotals(ENTRIES)).toEqual({ kcal: 630, protein: 70, carbs: 50, fat: 14 });
  });

  test("sumDayTotals falls back to food items when totals are absent", () => {
    const e: DiaryEntry[] = [
      {
        id: "x",
        meal_slot: "snack",
        food_items: [{ name: "Mela", grams: 150, kcal: 80, protein: 0.5, carbs: 20, fat: 0.3 }],
        total_kcal: null,
        total_protein_g: null,
        total_carbs_g: null,
        total_fat_g: null,
        notes: null,
        created_at: "2026-06-23T16:00:00Z",
      },
    ];
    expect(sumDayTotals(e).kcal).toBe(80);
  });

  test("sumDayTotals of nothing is all zeros", () => {
    expect(sumDayTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(sumDayTotals(undefined)).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  test("shiftDateISO moves by N days (incl. across month)", () => {
    expect(shiftDateISO("2026-06-23", -1)).toBe("2026-06-22");
    expect(shiftDateISO("2026-06-30", 1)).toBe("2026-07-01");
  });

  test("mealSlotLabel maps known slots to Italian, falls back gracefully", () => {
    expect(mealSlotLabel("breakfast")).toBe("Colazione");
    expect(mealSlotLabel(null)).toBe("Pasto");
    expect(mealSlotLabel("brunch")).toBe("brunch");
  });
});

describe("DiaryEntryList render", () => {
  test("renders the day total + each entry's foods", () => {
    const html = renderToStaticMarkup(createElement(DiaryEntryList, { entries: ENTRIES, loading: false }));
    expect(html).toContain("630"); // day total kcal
    expect(html).toContain("Colazione");
    expect(html).toContain("Avena");
    expect(html).toContain("Pranzo");
    expect(html).toContain("Pollo");
  });

  test("renders an empty state when there are no entries", () => {
    const html = renderToStaticMarkup(createElement(DiaryEntryList, { entries: [], loading: false }));
    expect(html).toContain("Nessun pasto registrato");
  });
});
