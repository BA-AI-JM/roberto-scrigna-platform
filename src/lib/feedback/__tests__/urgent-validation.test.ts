/**
 * Urgent-feedback validation + payload builder + formatting.
 */
import { describe, test, expect } from "vitest";
import {
  validateUrgent,
  buildUrgentPayload,
  statusBadge,
  kindLabel,
  severityLabel,
  formatSubmittedAt,
  EMPTY_URGENT_FORM,
  type UrgentFormState,
} from "../urgent-validation";

const feedback: UrgentFormState = { ...EMPTY_URGENT_FORM, kind: "feedback", message: "Mi sento molto stanco." };
const injury: UrgentFormState = {
  kind: "infortunio",
  message: "Dolore al ginocchio dopo la corsa.",
  area: "ginocchio destro",
  severity: "moderata",
  onsetDate: "2026-06-20",
  limitations: "non riesco a correre",
};

describe("validateUrgent", () => {
  test("feedback: only the message is required", () => {
    expect(validateUrgent(feedback).ok).toBe(true);
    expect(validateUrgent({ ...feedback, message: "   " }).message).toMatch(/Scrivi un messaggio/);
  });
  test("infortunio: area, severity and onset date are required; limitations optional", () => {
    expect(validateUrgent(injury).ok).toBe(true);
    expect(validateUrgent({ ...injury, area: "" }).area).toMatch(/zona/i);
    expect(validateUrgent({ ...injury, severity: "" }).severity).toMatch(/gravità/i);
    expect(validateUrgent({ ...injury, onsetDate: "" }).onsetDate).toMatch(/data/i);
    expect(validateUrgent({ ...injury, limitations: "" }).ok).toBe(true); // optional
  });
});

describe("buildUrgentPayload", () => {
  test("feedback → no injury block", () => {
    const { payload } = buildUrgentPayload(feedback);
    expect(payload).toEqual({ kind: "feedback", message: "Mi sento molto stanco." });
  });
  test("infortunio → structured injury payload (trimmed, limitations included)", () => {
    const { payload } = buildUrgentPayload(injury);
    expect(payload).toEqual({
      kind: "infortunio",
      message: "Dolore al ginocchio dopo la corsa.",
      injury: { area: "ginocchio destro", severity: "moderata", onsetDate: "2026-06-20", limitations: "non riesco a correre" },
    });
  });
  test("infortunio without limitations omits the optional key", () => {
    const { payload } = buildUrgentPayload({ ...injury, limitations: "  " });
    expect(payload?.injury).toEqual({ area: "ginocchio destro", severity: "moderata", onsetDate: "2026-06-20" });
  });
  test("invalid → payload null + surfaced validation", () => {
    const { payload, validation } = buildUrgentPayload({ ...injury, area: "" });
    expect(payload).toBeNull();
    expect(validation.area).toBeTruthy();
  });
});

describe("formatting", () => {
  test("statusBadge maps aperto/gestito + tolerates unknown", () => {
    expect(statusBadge("aperto").label).toBe("Aperto");
    expect(statusBadge("open").label).toBe("Aperto");
    expect(statusBadge("gestito").label).toBe("Gestito");
    expect(statusBadge("handled").label).toBe("Gestito");
    expect(statusBadge("weird").label).toBe("weird");
  });
  test("labels + date", () => {
    expect(kindLabel("infortunio")).toBe("Infortunio");
    expect(kindLabel("feedback")).toBe("Feedback urgente");
    expect(severityLabel("grave")).toBe("Grave");
    expect(formatSubmittedAt(null)).toBe("—");
    expect(formatSubmittedAt("2026-06-20T10:00:00Z")).not.toBe("—");
  });
});
