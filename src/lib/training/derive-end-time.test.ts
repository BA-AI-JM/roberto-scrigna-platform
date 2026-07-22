import { describe, it, expect } from "vitest";
import { deriveEndTime } from "./derive-end-time";

describe("deriveEndTime", () => {
  it("adds the duration to the start time (Roberto's case)", () => {
    expect(deriveEndTime("20:30", 90)).toBe("22:00");
  });

  it("handles exact-hour and odd-minute durations", () => {
    expect(deriveEndTime("18:00", 60)).toBe("19:00");
    expect(deriveEndTime("07:15", 45)).toBe("08:00");
    expect(deriveEndTime("09:05", 25)).toBe("09:30");
  });

  it("wraps past midnight", () => {
    expect(deriveEndTime("23:30", 60)).toBe("00:30");
    expect(deriveEndTime("23:45", 30)).toBe("00:15");
  });

  it("returns undefined when there is nothing to derive from (never '')", () => {
    expect(deriveEndTime(undefined, 90)).toBeUndefined();
    expect(deriveEndTime(null, 90)).toBeUndefined();
    expect(deriveEndTime("", 90)).toBeUndefined();
    expect(deriveEndTime("20:30", undefined)).toBeUndefined();
    expect(deriveEndTime("20:30", 0)).toBeUndefined();
  });

  it("returns undefined for a malformed start time", () => {
    expect(deriveEndTime("25:61", 90)).toBeUndefined();
    expect(deriveEndTime("8:00", 90)).toBeUndefined(); // not zero-padded → invalid
    expect(deriveEndTime("nonsense", 90)).toBeUndefined();
  });

  it("always yields a valid HH:MM the server would accept", () => {
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const start of ["00:00", "12:34", "23:59"]) {
      for (const dur of [1, 30, 90, 240, 480]) {
        const end = deriveEndTime(start, dur)!;
        expect(end, `${start}+${dur}`).toMatch(re);
      }
    }
  });
});
