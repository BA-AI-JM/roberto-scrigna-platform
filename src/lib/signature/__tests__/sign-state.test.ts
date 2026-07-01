/**
 * Pure signing-state machine — phase routing + message/format helpers.
 */
import { describe, test, expect } from "vitest";
import { deriveSignPhase, denyMessage, formatAcceptedAt, acceptanceMethodLabel } from "../sign-state";

describe("deriveSignPhase", () => {
  test("open + internal → signable (pending/sent/viewed, case-insensitive)", () => {
    expect(deriveSignPhase("pending", "internal")).toBe("signable");
    expect(deriveSignPhase("SENT", "internal")).toBe("signable");
    expect(deriveSignPhase("viewed", "internal")).toBe("signable");
  });

  test("signed always wins, for any provider", () => {
    expect(deriveSignPhase("signed", "internal")).toBe("signed");
    expect(deriveSignPhase("signed", "docusign")).toBe("signed");
    expect(deriveSignPhase("completed", "internal")).toBe("signed");
  });

  test("non-internal provider (not yet signed) → external", () => {
    expect(deriveSignPhase("pending", "docusign")).toBe("external");
    expect(deriveSignPhase("sent", "remote")).toBe("external");
  });

  test("terminal statuses map through", () => {
    expect(deriveSignPhase("declined", "internal")).toBe("declined");
    expect(deriveSignPhase("rejected", "internal")).toBe("declined");
    expect(deriveSignPhase("expired", "internal")).toBe("expired");
    expect(deriveSignPhase("cancelled", "internal")).toBe("cancelled");
    expect(deriveSignPhase("canceled", "internal")).toBe("cancelled");
  });

  test("unknown / missing status → unsignable (no crash)", () => {
    expect(deriveSignPhase("weird", "internal")).toBe("unsignable");
    expect(deriveSignPhase(null, "internal")).toBe("unsignable");
    expect(deriveSignPhase(undefined, undefined)).toBe("unsignable");
  });

  test("missing provider defaults to internal", () => {
    expect(deriveSignPhase("pending", null)).toBe("signable");
    expect(deriveSignPhase("pending", undefined)).toBe("signable");
  });
});

describe("denyMessage", () => {
  test("maps known codes, falls back generically", () => {
    expect(denyMessage("NOT_FOUND")).toMatch(/non trovata/i);
    expect(denyMessage("UNAUTHORIZED")).toMatch(/accesso/i);
    expect(denyMessage("FORBIDDEN")).toMatch(/accesso/i);
    expect(denyMessage("SOMETHING_ELSE")).toMatch(/problema/i);
    expect(denyMessage(null)).toMatch(/problema/i);
  });
});

describe("formatAcceptedAt", () => {
  test("formats a valid ISO and guards null/invalid", () => {
    expect(formatAcceptedAt("2026-06-30T16:05:00Z")).not.toBe("—");
    expect(formatAcceptedAt(null)).toBe("—");
    expect(formatAcceptedAt("not-a-date")).toBe("—");
  });
});

describe("acceptanceMethodLabel", () => {
  test("labels in_app_ses and tolerates others", () => {
    expect(acceptanceMethodLabel("in_app_ses")).toMatch(/in-app/i);
    expect(acceptanceMethodLabel(null)).toMatch(/firma/i);
    expect(acceptanceMethodLabel("custom")).toBe("custom");
  });
});
