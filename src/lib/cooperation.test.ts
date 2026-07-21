/** C1 (#2) — cooperation derivation (dates → engagement state). */
import { describe, test, expect } from "vitest";
import { deriveCooperation } from "./cooperation";

const T = new Date("2026-07-21T12:00:00");

describe("deriveCooperation", () => {
  test("fight camp inside its window → in corso with days left", () => {
    const v = deriveCooperation(
      { cooperation_type: "fight_camp", engagement_start: "2026-07-01", engagement_end: "2026-09-01" }, T);
    expect(v.label).toBe("Fight camp");
    expect(v.state).toBe("in_corso");
    expect(v.daysLeft).toBe(43); // inclusive of the end day
  });
  test("within 14 days of the end → in scadenza (reminder window)", () => {
    const v = deriveCooperation(
      { cooperation_type: "abbonamento", engagement_start: "2025-08-01", engagement_end: "2026-08-01" }, T);
    expect(v.state).toBe("in_scadenza");
    expect(v.daysLeft).toBe(12); // inclusive of the end day
  });
  test("past the end → scaduto; before the start → futuro", () => {
    expect(deriveCooperation({ cooperation_type: "fight_camp", engagement_start: "2026-05-01", engagement_end: "2026-07-01" }, T).state).toBe("scaduto");
    expect(deriveCooperation({ cooperation_type: "fight_camp", engagement_start: "2026-08-01", engagement_end: "2026-09-01" }, T).state).toBe("futuro");
  });
  test("consulenza with visit count labels itself; no dates → no state", () => {
    const v = deriveCooperation({ cooperation_type: "consulenza", visit_count: 5 }, T);
    expect(v.label).toBe("Consulenza · 5 visite");
    expect(v.state).toBe(null);
  });
  test("no type → null view; is_free carried", () => {
    const v = deriveCooperation({ is_free: true }, T);
    expect(v.label).toBe(null);
    expect(v.isFree).toBe(true);
  });
});
