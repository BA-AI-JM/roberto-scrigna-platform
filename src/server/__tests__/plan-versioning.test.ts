/**
 * Plan-versioning logic (lifecycle-spine increment 1).
 *
 * Mocking the tRPC ctx.supabase chain is impractical (see body-comp.test.ts), so
 * per the agreed fallback we unit-test the pure logic the createVersion /
 * listVersions procedures and the feedback scan call: version chaining + bump,
 * newest-first ordering, and the feedback-due predicate. The DB orchestration
 * (insert clone, archive prior, idempotent notification) is the thin wrapper
 * around these.
 */

import { describe, test, expect } from "vitest";
import {
  parseVersionLabel,
  formatVersionLabel,
  rootPlanIdOf,
  computeNextVersion,
  orderVersionsNewestFirst,
  isFeedbackDue,
  toClientPlanHistory,
  FEEDBACK_DUE_DAYS,
  type VersionRow,
  type RawPlanRow,
} from "../plan-versioning";

describe("parseVersionLabel", () => {
  test("parses major-only, major.minor, and bare numbers", () => {
    expect(parseVersionLabel("v1")).toEqual({ major: 1, minor: 0 });
    expect(parseVersionLabel("v1.2")).toEqual({ major: 1, minor: 2 });
    expect(parseVersionLabel("v2")).toEqual({ major: 2, minor: 0 });
    expect(parseVersionLabel("2.3")).toEqual({ major: 2, minor: 3 });
    expect(parseVersionLabel("V3.10")).toEqual({ major: 3, minor: 10 });
  });
  test("null / empty / garbage → root v1", () => {
    expect(parseVersionLabel(null)).toEqual({ major: 1, minor: 0 });
    expect(parseVersionLabel(undefined)).toEqual({ major: 1, minor: 0 });
    expect(parseVersionLabel("")).toEqual({ major: 1, minor: 0 });
    expect(parseVersionLabel("garbage")).toEqual({ major: 1, minor: 0 });
  });
});

describe("formatVersionLabel", () => {
  test("minor 0 → vMAJOR; minor > 0 → vMAJOR.MINOR", () => {
    expect(formatVersionLabel(1, 0)).toBe("v1");
    expect(formatVersionLabel(1, 1)).toBe("v1.1");
    expect(formatVersionLabel(2, 0)).toBe("v2");
    expect(formatVersionLabel(2, 3)).toBe("v2.3");
  });
});

describe("rootPlanIdOf", () => {
  test("a root plan (no parent) is its own root", () => {
    expect(rootPlanIdOf({ id: "P1", parent_plan_id: null })).toBe("P1");
    expect(rootPlanIdOf({ id: "P1" })).toBe("P1");
  });
  test("a child points at its parent (the root)", () => {
    expect(rootPlanIdOf({ id: "P2", parent_plan_id: "P1" })).toBe("P1");
  });
});

describe("computeNextVersion — chains + bumps (Roberto's convention)", () => {
  test("root → minor = v1.1, major = v2; version_number = max + 1", () => {
    const root: VersionRow[] = [{ versionNumber: 1, versionLabel: null }];
    expect(computeNextVersion(root, "minor")).toEqual({ versionNumber: 2, versionLabel: "v1.1" });
    expect(computeNextVersion(root, "major")).toEqual({ versionNumber: 2, versionLabel: "v2" });
  });

  test("regenerate/tweak keeps bumping the minor: v1 → v1.1 → v1.2", () => {
    const chain: VersionRow[] = [
      { versionNumber: 1, versionLabel: "v1" },
      { versionNumber: 2, versionLabel: "v1.1" },
    ];
    expect(computeNextVersion(chain, "minor")).toEqual({ versionNumber: 3, versionLabel: "v1.2" });
  });

  test("a brand-new plan is a major bump: v1.x → v2", () => {
    const chain: VersionRow[] = [
      { versionNumber: 1, versionLabel: "v1" },
      { versionNumber: 2, versionLabel: "v1.1" },
      { versionNumber: 3, versionLabel: "v1.2" },
    ];
    expect(computeNextVersion(chain, "major")).toEqual({ versionNumber: 4, versionLabel: "v2" });
  });

  test("minor after a major bumps the new major's minor: v2 → v2.1", () => {
    const chain: VersionRow[] = [
      { versionNumber: 1, versionLabel: "v1" },
      { versionNumber: 2, versionLabel: "v1.1" },
      { versionNumber: 3, versionLabel: "v2" },
    ];
    expect(computeNextVersion(chain, "minor")).toEqual({ versionNumber: 4, versionLabel: "v2.1" });
  });

  test("version_number is max(chain) + 1 even with gaps", () => {
    const chain: VersionRow[] = [
      { versionNumber: 1, versionLabel: "v1" },
      { versionNumber: 5, versionLabel: "v1.4" },
    ];
    expect(computeNextVersion(chain, "minor")).toEqual({ versionNumber: 6, versionLabel: "v1.5" });
  });

  test("empty chain is treated as the root", () => {
    expect(computeNextVersion([], "minor")).toEqual({ versionNumber: 2, versionLabel: "v1.1" });
  });

  test("full lifecycle: feed each result back into the chain", () => {
    let chain: VersionRow[] = [{ versionNumber: 1, versionLabel: "v1" }];
    const seq: Array<"minor" | "major"> = ["minor", "minor", "major", "minor"];
    const labels: string[] = [];
    for (const kind of seq) {
      const next = computeNextVersion(chain, kind);
      labels.push(next.versionLabel);
      chain = [...chain, { versionNumber: next.versionNumber, versionLabel: next.versionLabel }];
    }
    expect(labels).toEqual(["v1.1", "v1.2", "v2", "v2.1"]);
    // flat counter stayed monotonic across the whole chain
    expect(chain.map((c) => c.versionNumber)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("orderVersionsNewestFirst", () => {
  test("sorts by version_number descending", () => {
    const rows = [
      { versionNumber: 1, label: "v1" },
      { versionNumber: 3, label: "v1.2" },
      { versionNumber: 2, label: "v1.1" },
    ];
    expect(orderVersionsNewestFirst(rows).map((r) => r.label)).toEqual(["v1.2", "v1.1", "v1"]);
  });
  test("is stable on ties (preserves input order, e.g. created_at desc from the DB)", () => {
    const rows = [
      { versionNumber: 1, id: "a" },
      { versionNumber: 1, id: "b" },
    ];
    expect(orderVersionsNewestFirst(rows).map((r) => r.id)).toEqual(["a", "b"]);
  });
  test("does not mutate the input", () => {
    const rows = [{ versionNumber: 1 }, { versionNumber: 2 }];
    orderVersionsNewestFirst(rows);
    expect(rows.map((r) => r.versionNumber)).toEqual([1, 2]);
  });
});

describe("isFeedbackDue — fires once in the window after start_date", () => {
  const today = "2026-02-01";
  const minus = (days: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().split("T")[0];

  test("due exactly FEEDBACK_DUE_DAYS after start_date", () => {
    expect(isFeedbackDue(minus(FEEDBACK_DUE_DAYS), today)).toBe(true);
  });
  test("not yet due the day before", () => {
    expect(isFeedbackDue(minus(FEEDBACK_DUE_DAYS - 1), today)).toBe(false);
  });
  test("still matches inside the catch window, then stops", () => {
    expect(isFeedbackDue(minus(FEEDBACK_DUE_DAYS + 7), today)).toBe(true);
    expect(isFeedbackDue(minus(FEEDBACK_DUE_DAYS + 8), today)).toBe(false);
  });
  test("null start_date is never due", () => {
    expect(isFeedbackDue(null, today)).toBe(false);
    expect(isFeedbackDue(undefined, today)).toBe(false);
  });
  test("respects a custom dueDays (e.g. a future restriction protocol)", () => {
    expect(isFeedbackDue(minus(14), today, { dueDays: 14, catchDays: 0 })).toBe(true);
    expect(isFeedbackDue(minus(13), today, { dueDays: 14, catchDays: 0 })).toBe(false);
  });
});

describe("toClientPlanHistory — portal client-visible shaping", () => {
  const rows: RawPlanRow[] = [
    { id: "p1", status: "archived", version_number: 1, version_label: "v1", parent_plan_id: null, created_at: "2026-01-01T00:00:00Z" },
    { id: "p3", status: "active", version_number: 3, version_label: "v1.2", parent_plan_id: "p1", created_at: "2026-01-03T00:00:00Z" },
    { id: "p2", status: "archived", version_number: 2, version_label: "v1.1", parent_plan_id: "p1", created_at: "2026-01-02T00:00:00Z" },
  ];

  test("newest-first (created_at desc)", () => {
    expect(toClientPlanHistory(rows).map((v) => v.id)).toEqual(["p3", "p2", "p1"]);
  });

  test("active marker reflects status === 'active'", () => {
    const byId = Object.fromEntries(toClientPlanHistory(rows).map((v) => [v.id, v.isActive]));
    expect(byId).toEqual({ p1: false, p2: false, p3: true });
  });

  test("rootPlanId = parent_plan_id ?? id (groups the chain)", () => {
    const out = toClientPlanHistory(rows);
    expect(out.every((v) => v.rootPlanId === "p1")).toBe(true);
  });

  test("exposes ONLY client-visible fields — no coach internals leak", () => {
    const keys = Object.keys(toClientPlanHistory(rows)[0]!).sort();
    expect(keys).toEqual(
      ["createdAt", "id", "isActive", "rootPlanId", "status", "versionLabel", "versionNumber"]
    );
    // explicit: coach-only fields are absent
    const v = toClientPlanHistory(rows)[0]! as unknown as Record<string, unknown>;
    expect(v.change_reason).toBeUndefined();
    expect(v.feedback_check_in_id).toBeUndefined();
    expect(v.changeReason).toBeUndefined();
    expect(v.name).toBeUndefined();
    expect(v.notes).toBeUndefined();
  });

  test("defaults: null version/label/status → 1 / v1 / draft", () => {
    const [v] = toClientPlanHistory([
      { id: "x", status: null, version_number: null, version_label: null, parent_plan_id: null, created_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(v).toMatchObject({ versionNumber: 1, versionLabel: "v1", status: "draft", isActive: false, rootPlanId: "x" });
  });
});
