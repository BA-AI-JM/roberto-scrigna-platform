/**
 * #5/A1 — normalizeIntakeSession: legacy stored shapes must hydrate into the
 * strict save-schema shape (Roberto's "invalid" on every training-card save).
 */
import { describe, test, expect } from "vitest";
import { durationFromTimes, normalizeIntakeSession } from "./normalize-session";

describe("durationFromTimes", () => {
  test("18:00→19:30 = 90 (the exact stored shape that broke saves)", () => {
    expect(durationFromTimes("18:00", "19:30")).toBe(90);
  });
  test("overnight 23:00→00:30 wraps to 90", () => {
    expect(durationFromTimes("23:00", "00:30")).toBe(90);
  });
  test("unusable inputs → null", () => {
    expect(durationFromTimes(undefined, "19:00")).toBe(null);
    expect(durationFromTimes("", "19:00")).toBe(null);
    expect(durationFromTimes("25:00", "26:00")).toBe(null);
  });
});

describe("normalizeIntakeSession", () => {
  test("Roberto's stored session: no duration_min, times present → derived 90", () => {
    const s = normalizeIntakeSession({ rpe: 7, endTime: "19:30", modality: "cycling", startTime: "18:00" });
    expect(s).toEqual({ modality: "cycling", duration_min: 90, rpe: 7, startTime: "18:00", endTime: "19:30" });
  });
  test("nothing usable → safe defaults (60 min, rpe 7)", () => {
    expect(normalizeIntakeSession({})).toEqual({ modality: "Pesi — Ipertrofia", duration_min: 60, rpe: 7 });
  });
  test("valid modern session passes through unchanged, override kept", () => {
    const s = normalizeIntakeSession({ modality: "Boxe", duration_min: 40, rpe: 8, kcal_override: 240 });
    expect(s).toEqual({ modality: "Boxe", duration_min: 40, rpe: 8, kcal_override: 240 });
  });
  test("stringy numbers and out-of-range values are coerced/clamped", () => {
    const s = normalizeIntakeSession({ modality: "Corsa", duration_min: "600", rpe: "13" });
    expect(s.duration_min).toBe(480);
    expect(s.rpe).toBe(10);
  });
  test("invalid override and empty-string times are dropped", () => {
    const s = normalizeIntakeSession({ modality: "Corsa", duration_min: 30, rpe: 5, kcal_override: -10, startTime: "" });
    expect(s).toEqual({ modality: "Corsa", duration_min: 30, rpe: 5 });
  });
});
