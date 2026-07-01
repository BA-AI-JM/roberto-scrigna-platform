/**
 * #10 (display-only) — trainingLog.setSessionKcalOverride + the read surface +
 * the NON-PLAN-MOVING invariant.
 *
 * Asserts: the override writes ONLY training_log.kcal_override (+ null clears);
 * partner-scope denial; the override is returned by the coach list read surface;
 * AND — the load-bearing invariant — that a per-session kcal override does NOT
 * change a generated plan bundle (the engine output is byte-identical whether or
 * not an override is present), proving it is display-only / not plan-moving.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock("../../../lib/anthropic/client", () => ({ getAnthropic: () => ({}) }));

const holder = vi.hoisted(() => ({
  updated: [] as Array<{ table: string; set: Record<string, unknown>; filters: Record<string, unknown> }>,
}));

import { trainingLogRouter } from "../training-log";
import {
  generateWeeklyPlan,
  type ClientSnapshot,
  type ExerciseSession,
  type PlanOptions,
} from "@/engine";

const SESSION = "11111111-1111-4111-8111-111111111111";
const CID = "22222222-2222-4222-8222-222222222222";

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      const filtered = () =>
        (tables[table] ?? []).filter((r) => Object.entries(f).every(([k, v]) => r[k] === v));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        is: (c: string, v: unknown) => ((f[c] = v), b),
        order: () => b,
        range: () => b,
        single: () =>
          Promise.resolve(
            filtered()[0] ? { data: filtered()[0], error: null } : { data: null, error: { message: "no rows" } }
          ),
        then: (res: (v: unknown) => unknown) =>
          res({ data: filtered(), count: filtered().length, error: null }),
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
                holder.updated.push({ table, set, filters: { ...uf } });
                return Promise.resolve({ data: { ...match, ...set }, error: null });
              },
            }),
          };
          return ub;
        },
      };
      return b;
    },
  };
}

const caller = (db: unknown, partnerId = "p1") =>
  trainingLogRouter.createCaller({ userId: "u", partnerId, supabase: db } as never);

beforeEach(() => {
  holder.updated = [];
});

// ── setSessionKcalOverride ────────────────────────────────────────────────────
describe("trainingLog.setSessionKcalOverride", () => {
  const ownedDb = () =>
    makeDb({ training_log: [{ id: SESSION, partner_id: "p1", client_id: CID, deleted_at: null, kcal_estimated: 300 }] });

  test("writes ONLY kcal_override (positive), scoped to the session + partner", async () => {
    const res = await caller(ownedDb()).setSessionKcalOverride({ sessionId: SESSION, kcalOverride: 450 });
    expect(res.kcal_override).toBe(450);

    const w = holder.updated.find((u) => u.table === "training_log")!;
    expect(w.set).toEqual({ kcal_override: 450 }); // ONLY this column — nothing that feeds generation
    expect(w.filters).toMatchObject({ id: SESSION, partner_id: "p1", deleted_at: null });
  });

  test("null clears the override", async () => {
    const seeded = makeDb({
      training_log: [{ id: SESSION, partner_id: "p1", client_id: CID, deleted_at: null, kcal_override: 450 }],
    });
    const res = await caller(seeded).setSessionKcalOverride({ sessionId: SESSION, kcalOverride: null });
    expect(res.kcal_override).toBeNull();
    expect(holder.updated[0]!.set).toEqual({ kcal_override: null });
  });

  test("DENIES a session belonging to another partner (no write)", async () => {
    const foreign = makeDb({
      training_log: [{ id: SESSION, partner_id: "pOther", client_id: CID, deleted_at: null }],
    });
    await expect(
      caller(foreign, "p1").setSessionKcalOverride({ sessionId: SESSION, kcalOverride: 450 })
    ).rejects.toThrow();
    expect(holder.updated).toHaveLength(0);
  });

  test("rejects a non-positive override (zod)", async () => {
    await expect(
      caller(ownedDb()).setSessionKcalOverride({ sessionId: SESSION, kcalOverride: 0 })
    ).rejects.toThrow();
    expect(holder.updated).toHaveLength(0);
  });
});

// ── read surface exposes the override ─────────────────────────────────────────
describe("trainingLog.list read surface", () => {
  test("returns kcal_override so display can prefer it", async () => {
    const db = makeDb({
      training_log: [
        { id: SESSION, client_id: CID, partner_id: "p1", deleted_at: null, session_date: "2026-06-01", session_type: "cardio", kcal_estimated: 300, kcal_calculated: 280, kcal_override: 520 },
      ],
    });
    const res = await caller(db).list({ clientId: CID });
    expect(res.logs).toHaveLength(1);
    expect((res.logs[0] as { kcal_override: number }).kcal_override).toBe(520);
  });
});

// ── NON-PLAN-MOVING invariant ──────────────────────────────────────────────────
//
// The display-only kcal_override lives on training_log. Generation NEVER reads
// training_log: plan.ts builds the engine's exercise-expenditure input from the
// snapshot intake (skinfold_data._intake.training_sessions → intakeTrainingSessions
// → PlanOptions.perDayTrainingSession, an ExerciseSession[]). So the ONLY way the
// override could move a plan is if the engine read a kcal_override off the session
// objects it actually consumes. These tests drive that REAL consumed surface:
//   • positive control — varying a field the engine DOES read (kcalEstimate on a
//     session_estimate session) changes the plan, proving the input path is live
//     (so the invariant below is discriminating, not a constant-output tautology);
//   • invariant — attaching a kcal_override to those same consumed session objects
//     leaves the bundle byte-identical, proving the engine ignores the column.
// If someone wired training_log.kcal_override into generation, the invariant FAILS.
describe("invariant: a session kcal override does NOT move the plan", () => {
  const snap: ClientSnapshot = {
    sex: "male",
    ageYears: 30,
    weightKg: 85,
    heightCm: 180,
    dailySteps: 10000,
    occupationalLevel: "sedentary",
    weekSchedule: ["training", "rest", "training", "rest", "training", "rest", "rest"],
  };
  // A real exercise-expenditure input for the training day at index 0 — exactly
  // the shape plan.ts feeds generateWeeklyPlan from the snapshot intake.
  const session = (extra?: Record<string, unknown>): ExerciseSession =>
    ({ method: "session_estimate", durationMin: 60, kcalEstimate: 500, ...extra }) as ExerciseSession;
  const withSession = (s: ExerciseSession): PlanOptions => ({
    perDayTrainingSession: [s, null, null, null, null, null, null],
  });

  test("positive control: the consumed exercise-session surface DOES move the plan", () => {
    const low = generateWeeklyPlan(snap, withSession(session({ kcalEstimate: 200 })));
    const high = generateWeeklyPlan(snap, withSession(session({ kcalEstimate: 900 })));
    // If this fails, perDayTrainingSession isn't a live input and the invariant
    // below would be a vacuous constant-output check.
    expect(JSON.stringify(high)).not.toBe(JSON.stringify(low));
  });

  test("invariant: a kcal_override on the consumed session objects is IGNORED (byte-identical)", () => {
    const baseline = generateWeeklyPlan(snap, withSession(session()));
    // Same session, now carrying the training_log.kcal_override column — exactly how
    // an accidental training_log→intake join would surface it on the consumed object.
    // Expenditure must come from the session's real fields, never kcal_override.
    const withOverride = generateWeeklyPlan(snap, withSession(session({ kcal_override: 999 })));
    expect(JSON.stringify(withOverride)).toBe(JSON.stringify(baseline));
  });
});
