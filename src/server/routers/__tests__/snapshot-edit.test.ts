/**
 * #5 — client.editSnapshot (retroactive measurement editing).
 *
 * Asserts: an edit updates the client_snapshot columns AND recomputes body
 * composition (proven against the real derivation, non-vacuously — the captured
 * write payload is inspected); the snapshot_edit_audit row records the changed-only
 * before->after with edited_by; partner-scope denial writes nothing; and the
 * NON-PLAN-MOVING invariant — editing a snapshot never touches a frozen plan bundle.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

import { clientRouter } from "../client";
import { deriveSnapshotColumns } from "../../snapshot-fields";

const SNAP = "11111111-1111-4111-8111-111111111111";
const CID = "22222222-2222-4222-8222-222222222222";
const PLAN = "33333333-3333-4333-8333-333333333333";

// A real 7-site skinfold set (intake field names) → body comp is non-null.
const skinfolds = {
  triceps: 8,
  chest: 10,
  abdomen: 20,
  suprailiac: 16,
  subscapular: 14,
  thigh: 18,
  midaxillary: 12,
};
const DCTX = { ageYears: 30, clientSex: "male" as const };
const before = deriveSnapshotColumns({ weightKg: 80, skinfolds }, DCTX);
const afterExpected = deriveSnapshotColumns({ weightKg: 90, skinfolds }, DCTX);

// A frozen plan bundle — must be byte-identical after any snapshot edit.
const FROZEN_PLAN = {
  id: PLAN,
  client_id: CID,
  snapshot_id: SNAP,
  daily_targets: { plan_bundle: { weeklyAverageKcal: 2500, days: [1, 2, 3] } },
};

function makeDb(seed: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = JSON.parse(JSON.stringify(seed));
  const captured = {
    updated: [] as Array<{ table: string; set: Record<string, unknown>; filters: Record<string, unknown> }>,
    inserted: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  };
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const rows = () =>
        (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((filters[c] = v), b),
        is: (c: string, v: unknown) => ((filters[c] = v), b),
        single: () => {
          const r = rows()[0];
          return Promise.resolve(r ? { data: r, error: null } : { data: null, error: { message: "no rows" } });
        },
        update: (set: Record<string, unknown>) => {
          const uf: Record<string, unknown> = {};
          const ub: Record<string, unknown> = {
            eq: (c: string, v: unknown) => ((uf[c] = v), ub),
            is: (c: string, v: unknown) => ((uf[c] = v), ub),
            select: () => ({
              single: () => {
                const match = (tables[table] ?? []).find((r) =>
                  Object.entries(uf).every(([k, v]) => r[k] === v)
                );
                if (!match) return Promise.resolve({ data: null, error: { message: "no rows" } });
                captured.updated.push({ table, set, filters: { ...uf } });
                Object.assign(match, set); // mutate seeded row (so plan-untouched is observable)
                return Promise.resolve({ data: { ...match }, error: null });
              },
            }),
          };
          return ub;
        },
        insert: (payload: Record<string, unknown>) => {
          captured.inserted.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
      return b;
    },
  };
  return { db, captured, tables };
}

const seededSnapshot = (over: Record<string, unknown> = {}) => ({
  id: SNAP,
  client_id: CID,
  age_years: 30,
  weight_kg: 80,
  height_cm: null,
  daily_steps: null,
  occupational_level: null,
  week_schedule: before.week_schedule,
  skinfold_data: before.skinfold_data,
  body_fat_method: before.body_fat_method,
  body_fat_pct: before.body_fat_pct,
  lean_mass_kg: before.lean_mass_kg,
  fat_mass_kg: before.fat_mass_kg,
  bmr_kcal: before.bmr_kcal,
  notes: before.notes,
  ...over,
});

const ownedDb = (clientPartner = "p1") =>
  makeDb({
    client_snapshot: [seededSnapshot()],
    client: [{ id: CID, sex: "male", partner_id: clientPartner, deleted_at: null }],
    plan: [FROZEN_PLAN],
  });

const caller = (db: unknown, partnerId = "p1") =>
  clientRouter.createCaller({ userId: "u1", partnerId, supabase: db } as never);

// Sanity: the fixtures actually differ (weight drives lean/fat mass + BMR).
beforeEach(() => {
  expect(before.body_fat_pct).not.toBeNull();
  expect(afterExpected.lean_mass_kg).not.toBe(before.lean_mass_kg);
});

describe("client.editSnapshot — update + recompute", () => {
  test("updates the changed field AND persists the recomputed body composition", async () => {
    const { db, captured } = ownedDb();
    const res = await caller(db).editSnapshot({ snapshotId: SNAP, fields: { weightKg: 90 } });

    const w = captured.updated.find((u) => u.table === "client_snapshot")!;
    expect(w.filters).toMatchObject({ id: SNAP });
    // recompute is real: body-comp columns match deriveSnapshotColumns for weight 90.
    expect(w.set.weight_kg).toBe(90);
    expect(w.set.lean_mass_kg).toBe(afterExpected.lean_mass_kg);
    expect(w.set.fat_mass_kg).toBe(afterExpected.fat_mass_kg);
    expect(w.set.bmr_kcal).toBe(afterExpected.bmr_kcal);
    // skinfolds unchanged → body_fat_pct unchanged (proves it isn't blindly rewritten).
    expect(w.set.body_fat_pct).toBe(before.body_fat_pct);
    // returned snapshot carries the recomputed body comp (the UI contract).
    expect(res.snapshot.lean_mass_kg).toBe(afterExpected.lean_mass_kg);
    expect(res.snapshot.bmr_kcal).toBe(afterExpected.bmr_kcal);
  });
});

describe("client.editSnapshot — audit trail", () => {
  test("appends a changed-only before->after audit row with edited_by", async () => {
    const { db, captured } = ownedDb();
    await caller(db).editSnapshot({ snapshotId: SNAP, fields: { weightKg: 90 } });

    const audits = captured.inserted.filter((i) => i.table === "snapshot_edit_audit");
    expect(audits).toHaveLength(1);
    const a = audits[0]!.payload;
    expect(a.snapshot_id).toBe(SNAP);
    expect(a.client_id).toBe(CID);
    expect(a.edited_by).toBe("u1");

    const changed = a.changed_fields as Record<string, { before: unknown; after: unknown }>;
    // Only weight + weight-derived body-comp changed (skinfolds untouched).
    expect(new Set(Object.keys(changed))).toEqual(
      new Set(["weight_kg", "lean_mass_kg", "fat_mass_kg", "bmr_kcal"])
    );
    expect(changed.weight_kg).toEqual({ before: 80, after: 90 });
    expect(changed.lean_mass_kg).toEqual({
      before: before.lean_mass_kg,
      after: afterExpected.lean_mass_kg,
    });
    // Unchanged columns must NOT appear (proves the diff is real, not a dump).
    expect(changed.body_fat_pct).toBeUndefined();
    expect(changed.height_cm).toBeUndefined();
    expect(changed.skinfold_data).toBeUndefined();
  });

  test("a no-op edit writes NO audit row", async () => {
    const { db, captured } = ownedDb();
    // Re-submit the same weight → nothing changes.
    await caller(db).editSnapshot({ snapshotId: SNAP, fields: { weightKg: 80 } });
    expect(captured.inserted.filter((i) => i.table === "snapshot_edit_audit")).toHaveLength(0);
  });
});

describe("client.editSnapshot — partner scope", () => {
  test("DENIES editing a snapshot whose client belongs to another partner (no writes)", async () => {
    const { db, captured } = ownedDb("pOther");
    await expect(
      caller(db, "p1").editSnapshot({ snapshotId: SNAP, fields: { weightKg: 90 } })
    ).rejects.toThrow();
    expect(captured.updated).toHaveLength(0);
    expect(captured.inserted).toHaveLength(0);
  });
});

describe("client.editSnapshot — NON-PLAN-MOVING invariant", () => {
  test("editing a snapshot never writes to (or mutates) a frozen plan bundle", async () => {
    const { db, captured, tables } = ownedDb();
    const frozen = JSON.stringify(tables.plan![0]!.daily_targets);

    await caller(db).editSnapshot({ snapshotId: SNAP, fields: { weightKg: 90 } });

    // No write ever targeted the plan table…
    expect(captured.updated.some((u) => u.table === "plan")).toBe(false);
    expect(captured.inserted.some((i) => i.table === "plan")).toBe(false);
    // …and the frozen bundle is byte-identical.
    expect(JSON.stringify(tables.plan![0]!.daily_targets)).toBe(frozen);
  });
});
