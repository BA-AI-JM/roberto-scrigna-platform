/** A4 (#14) — open-redirect guard for the portal deep-link target. */
import { describe, test, expect } from "vitest";
import { isSafePortalPath } from "./next-path";

describe("isSafePortalPath", () => {
  test("accepts the delivery-email target and portal pages", () => {
    expect(isSafePortalPath("/portal/plan")).toBe(true);
    expect(isSafePortalPath("/portal/dashboard")).toBe(true);
    expect(isSafePortalPath("/portal/progress")).toBe(true);
  });

  test("rejects external and protocol-relative targets", () => {
    expect(isSafePortalPath("https://evil.com/portal/plan")).toBe(false);
    expect(isSafePortalPath("//evil.com/portal")).toBe(false);
    expect(isSafePortalPath("/portal/x://y")).toBe(false);
  });

  test("rejects traversal, backslashes, non-portal paths, non-strings", () => {
    expect(isSafePortalPath("/portal/../admin")).toBe(false);
    expect(isSafePortalPath("/portal\\evil")).toBe(false);
    expect(isSafePortalPath("/dashboard")).toBe(false);
    expect(isSafePortalPath("/portal")).toBe(false);
    expect(isSafePortalPath(undefined)).toBe(false);
    expect(isSafePortalPath(42)).toBe(false);
  });

  test("rejects query/hash-carrying targets (path-only contract)", () => {
    expect(isSafePortalPath("/portal/plan?x=1")).toBe(false);
    expect(isSafePortalPath("/portal/plan#f")).toBe(false);
  });
});
