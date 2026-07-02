/**
 * Job A — plan.generate surfaces the REAL error server-side.
 *
 * Proves: an unexpected engine error is LOGGED with full fidelity (console.error
 * with the "[router/plan.generate] engine error:" tag + the real Error + a stack)
 * while the CLIENT still receives the friendly, safe TRPCError — and a specific
 * precondition surfaces its OWN message, never re-masked as the generic
 * "dati completi". (The catch also rethrows any TRPCError thrown inside the try —
 * the in-try counterpart of the precondition case; that branch is defensive.)
 *
 * This is the guard that would have made the food-CSV ENOENT visible in prod logs
 * without a manual log-tail.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock("../../../lib/anthropic/client", () => ({ getAnthropic: () => ({}) }));

// Control the engine cheaply: a malformed generatePlan return makes buildPlanArtifacts
// throw a REAL app error (not a mock-thrown error), which the mutation's catch handles.
const genSpy = vi.hoisted(() => vi.fn());
vi.mock("../../../services/plan-generator", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, generatePlan: genSpy };
});

import { planRouter } from "../plan";

const CID = "11111111-1111-4111-8111-111111111111";
const TAG = "[router/plan.generate] engine error:";

const CLIENT = {
  id: CID, full_name: "Test", email: null, phone: null,
  date_of_birth: "1990-01-01", sex: "male", status: "active",
};
const SNAPSHOT = {
  id: "s1", client_id: CID, skinfold_data: {}, week_schedule: null,
  weight_kg: 80, height_cm: 180, age_years: 34, daily_steps: 8000,
  occupational_level: "sedentary",
};

/** Minimal chainable supabase fake; per-table single() rows control the flow. */
function makeDb(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b, eq: () => b, is: () => b, order: () => b, limit: () => b,
        single: () =>
          Promise.resolve(
            table in rows
              ? { data: rows[table], error: null }
              : { data: null, error: { message: "no rows" } }
          ),
      };
      return b;
    },
  };
}
const caller = (db: unknown) =>
  planRouter.createCaller({ userId: "u", partnerId: "p1", supabase: db } as never);

beforeEach(() => genSpy.mockReset());

describe("plan.generate — real error surfaced, friendly message preserved", () => {
  test("unexpected engine error is LOGGED with full fidelity; client gets the safe message", async () => {
    // Malformed engine result → buildPlanArtifacts throws a real Error inside the try.
    genSpy.mockReturnValue({} as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Client sees the friendly, safe message — no internals leaked.
    await expect(
      caller(makeDb({ client: CLIENT, client_snapshot: SNAPSHOT })).generate({ clientId: CID })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("dati del cliente"),
    });

    // The REAL underlying error reached the server logs: tag + the Error + a stack string.
    const logged = errSpy.mock.calls.find((c) => c[0] === TAG);
    expect(logged).toBeDefined();
    expect(logged?.[1]).toBeInstanceOf(Error); // the actual error object, not swallowed
    expect(typeof logged?.[2]).toBe("string"); // full stack captured
    errSpy.mockRestore();
  });

  test("a specific precondition surfaces its OWN message, not the generic 'dati completi'", async () => {
    // No snapshot → the pre-generation precondition fires with its specific message;
    // the generic engine-catch message must NOT mask it.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      caller(makeDb({ client: CLIENT })).generate({ clientId: CID })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("misurazione"), // "Nessuna misurazione trovata…"
    });

    // A precondition is not an engine error → the engine-error log must NOT fire.
    expect(errSpy.mock.calls.some((c) => c[0] === TAG)).toBe(false);
    errSpy.mockRestore();
  });
});
