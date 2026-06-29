/**
 * #25 Stage A — plan-update heuristic (weight-change → suggest regenerate).
 *
 * Covers the pure decision logic (computeWeightChangePct / shouldSuggestRegen /
 * resolveStartAndLatestWeight) and the scan core against a chainable fake
 * service-role Supabase. The guarantees proven here:
 *   - a ≥10% bodyweight LOSS emits a suggestion; a smaller loss does NOT;
 *   - the emitted notification is COACH-SCOPED (client_id = null) so the patient
 *     portal feed never sees it;
 *   - same-day idempotency: a plan already prompted today is not re-prompted;
 *   - the scan NEVER touches the plan table (prompt layer only).
 */

import { describe, test, expect } from "vitest";
import {
  WEIGHT_CHANGE_THRESHOLD,
  SUGGESTED_KCAL_TRIM_PCT,
  PLAN_UPDATE_SUGGESTED_TRIGGER,
  computeWeightChangePct,
  shouldSuggestRegen,
  resolveStartAndLatestWeight,
  scanPlanUpdateHeuristicsCore,
} from "../plan-update-heuristics";

// ── Pure: computeWeightChangePct ─────────────────────────────────────────────
describe("computeWeightChangePct", () => {
  test("signed fractional change; a loss is negative", () => {
    expect(computeWeightChangePct(90, 81)).toBeCloseTo(-0.1, 10); // exact 10% loss
    expect(computeWeightChangePct(80, 88)).toBeCloseTo(0.1, 10); // 10% gain (positive)
    expect(computeWeightChangePct(100, 100)).toBe(0);
  });

  test("guards non-positive / non-finite inputs → 0 (no signal)", () => {
    expect(computeWeightChangePct(0, 80)).toBe(0);
    expect(computeWeightChangePct(-5, 80)).toBe(0);
    expect(computeWeightChangePct(Number.NaN, 80)).toBe(0);
    expect(computeWeightChangePct(90, Number.NaN)).toBe(0);
  });
});

// ── Pure: shouldSuggestRegen (loss-only, ≥ threshold) ────────────────────────
describe("shouldSuggestRegen", () => {
  test("true only for a loss at or beyond the threshold", () => {
    expect(shouldSuggestRegen(-WEIGHT_CHANGE_THRESHOLD)).toBe(true); // exactly −10%
    expect(shouldSuggestRegen(-0.2)).toBe(true); // −20%
    expect(shouldSuggestRegen(-0.099)).toBe(false); // −9.9% just under
    expect(shouldSuggestRegen(0)).toBe(false);
    expect(shouldSuggestRegen(0.2)).toBe(false); // a GAIN never trips Stage A
  });
});

// ── Pure: resolveStartAndLatestWeight ────────────────────────────────────────
describe("resolveStartAndLatestWeight", () => {
  test("start = earliest sample on/after plan start; latest = most recent", () => {
    const r = resolveStartAndLatestWeight(
      [
        { weightKg: 90, date: "2026-05-01T08:00:00Z" }, // on plan start
        { weightKg: 85, date: "2026-05-20" },
        { weightKg: 80, date: "2026-06-20" }, // latest
      ],
      "2026-05-01",
    );
    expect(r).toEqual({ startKg: 90, latestKg: 80 });
  });

  test("falls back to earliest-overall baseline when the only post-start sample is the latest", () => {
    const r = resolveStartAndLatestWeight(
      [
        { weightKg: 90, date: "2026-01-01" }, // pre-start baseline
        { weightKg: 80, date: "2026-06-20" }, // only post-start sample = latest
      ],
      "2026-05-01",
    );
    expect(r).toEqual({ startKg: 90, latestKg: 80 });
  });

  test("ignores null/invalid weights and needs two distinct days", () => {
    expect(
      resolveStartAndLatestWeight([{ weightKg: 80, date: "2026-06-20" }], "2026-05-01"),
    ).toBeNull(); // only one sample
    expect(
      resolveStartAndLatestWeight(
        [
          { weightKg: null, date: "2026-05-01" },
          { weightKg: 80, date: "2026-06-20" },
        ],
        "2026-05-01",
      ),
    ).toBeNull(); // null weight dropped → one usable sample
    expect(
      resolveStartAndLatestWeight(
        [
          { weightKg: 90, date: "2026-06-20" },
          { weightKg: 80, date: "2026-06-20" },
        ],
        "2026-05-01",
      ),
    ).toBeNull(); // same single day
  });
});

// ── Scan core against a fake Supabase ────────────────────────────────────────

/**
 * Chainable fake service-role client supporting exactly the calls the scan uses:
 * from().select(...).eq(...).is(...).gte(...) (thenable → {data} or {count}) and
 * from().insert(payload) (records into the same in-memory tables).
 */
function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const preds: Array<(r: Record<string, unknown>) => boolean> = [];
      let isCount = false;
      const apply = () => (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
      const b: Record<string, unknown> = {
        select: (_cols?: unknown, opts?: { head?: boolean; count?: string }) => {
          if (opts?.head || opts?.count) isCount = true;
          return b;
        },
        eq: (c: string, v: unknown) => {
          if (c === "metadata->>planId") {
            preds.push((r) => (r.metadata as Record<string, unknown> | undefined)?.planId === v);
          } else {
            preds.push((r) => r[c] === v);
          }
          return b;
        },
        is: (c: string, v: unknown) => {
          preds.push((r) => (r[c] ?? null) === v);
          return b;
        },
        gte: (c: string, v: unknown) => {
          preds.push((r) => String(r[c]) >= String(v));
          return b;
        },
        insert: (payload: Record<string, unknown>) => {
          (tables[table] ??= []).push({
            created_at: new Date(0).toISOString(),
            ...payload,
          });
          return Promise.resolve({ data: null, error: null });
        },
        then: (res: (v: unknown) => unknown) =>
          res(isCount ? { count: apply().length, data: null, error: null } : { data: apply(), error: null }),
      };
      return b;
    },
  };
}

const NOW = Date.parse("2026-06-29T09:00:00Z");
const ACTIVE_PLAN = {
  id: "pX",
  client_id: "cA",
  partner_id: "P1",
  name: "Piano A",
  start_date: "2026-05-01",
  status: "active",
  deleted_at: null,
};

describe("scanPlanUpdateHeuristicsCore — weight-change → suggest regenerate", () => {
  test("emits a COACH-SCOPED suggestion when the client lost ≥10% (90→80)", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      plan: [ACTIVE_PLAN],
      client_snapshot: [{ client_id: "cA", weight_kg: 90, taken_at: "2026-05-01T08:00:00Z" }],
      check_in: [{ client_id: "cA", weight_kg: 80, check_in_date: "2026-06-20" }],
      notification: [],
    };
    const results = await scanPlanUpdateHeuristicsCore(makeDb(tables), NOW);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ planId: "pX", clientId: "cA", emitted: true });

    expect(tables.notification).toHaveLength(1);
    const n = tables.notification![0]!;
    expect(n.client_id).toBeNull(); // COACH-SCOPED — never visible to the patient portal feed
    expect(n.trigger).toBe(PLAN_UPDATE_SUGGESTED_TRIGGER);
    expect(n.priority).toBe("medium");
    expect(n.partner_id).toBe("P1");
    expect(n.title).toBe("Aggiornamento piano suggerito");
    expect(n.body).toContain("–11% peso"); // (80−90)/90 ≈ −11.1% → rounds to 11
    const meta = n.metadata as Record<string, unknown>;
    expect(meta.planId).toBe("pX");
    expect(meta.clientId).toBe("cA");
    expect(meta.weightChangePct as number).toBeCloseTo(-0.1111, 3);
    expect(meta.suggestedKcalReductionPct).toBe(-SUGGESTED_KCAL_TRIM_PCT); // −0.085, documented only

    // PROMPT LAYER ONLY: the plan table is never written.
    expect(tables.plan).toEqual([ACTIVE_PLAN]);
  });

  test("does NOT emit when the loss is below 10% (80→76 = −5%)", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      plan: [ACTIVE_PLAN],
      client_snapshot: [{ client_id: "cA", weight_kg: 80, taken_at: "2026-05-01T08:00:00Z" }],
      check_in: [{ client_id: "cA", weight_kg: 76, check_in_date: "2026-06-20" }],
      notification: [],
    };
    const results = await scanPlanUpdateHeuristicsCore(makeDb(tables), NOW);

    expect(results[0]).toMatchObject({ emitted: false, reason: "below-threshold" });
    expect(tables.notification).toHaveLength(0);
  });

  test("same-day idempotency: a plan already prompted today is not re-prompted", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      plan: [ACTIVE_PLAN],
      client_snapshot: [{ client_id: "cA", weight_kg: 90, taken_at: "2026-05-01T08:00:00Z" }],
      check_in: [{ client_id: "cA", weight_kg: 80, check_in_date: "2026-06-20" }],
      notification: [
        {
          id: "existing",
          trigger: PLAN_UPDATE_SUGGESTED_TRIGGER,
          client_id: null,
          metadata: { planId: "pX" },
          created_at: "2026-06-29T08:00:00Z", // earlier today
        },
      ],
    };
    const results = await scanPlanUpdateHeuristicsCore(makeDb(tables), NOW);

    expect(results[0]).toMatchObject({ emitted: false, reason: "already-prompted-today" });
    expect(tables.notification).toHaveLength(1); // no duplicate inserted
  });

  test("a prompt from a PRIOR day does not suppress today's (window is same-day only)", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      plan: [ACTIVE_PLAN],
      client_snapshot: [{ client_id: "cA", weight_kg: 90, taken_at: "2026-05-01T08:00:00Z" }],
      check_in: [{ client_id: "cA", weight_kg: 80, check_in_date: "2026-06-20" }],
      notification: [
        {
          id: "yesterday",
          trigger: PLAN_UPDATE_SUGGESTED_TRIGGER,
          client_id: null,
          metadata: { planId: "pX" },
          created_at: "2026-06-28T08:00:00Z", // yesterday
        },
      ],
    };
    const results = await scanPlanUpdateHeuristicsCore(makeDb(tables), NOW);

    expect(results[0]).toMatchObject({ emitted: true });
    expect(tables.notification).toHaveLength(2); // today's prompt added
  });

  test("skips plans without two usable weight samples", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      plan: [ACTIVE_PLAN],
      client_snapshot: [{ client_id: "cA", weight_kg: 90, taken_at: "2026-05-01T08:00:00Z" }],
      check_in: [],
      notification: [],
    };
    const results = await scanPlanUpdateHeuristicsCore(makeDb(tables), NOW);

    expect(results[0]).toMatchObject({ emitted: false, reason: "insufficient-weight-data" });
    expect(tables.notification).toHaveLength(0);
  });
});
