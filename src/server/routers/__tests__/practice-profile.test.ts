/**
 * Practice-profile router (#29) — partner-scoped read/upsert.
 *
 * The scoping tests are non-vacuous: the cross-partner read pairs a DENIAL (p1
 * sees null, not pOther's secret) with a same-row POSITIVE control (pOther reads
 * its own), proving `.eq("partner_id", ctx.partnerId)` is the boundary; and the
 * upsert asserts the row is stamped with the CALLER's partner_id (can't target
 * another partner). The table's RLS is the real DB enforcement on top of this.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, getAll: () => [] }),
}));

import { practiceProfileRouter } from "../practice-profile";

const sink = vi.hoisted(() => ({ upserts: [] as Array<{ table: string; payload: Record<string, unknown> }> }));

function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const f: Record<string, unknown> = {};
      const rows = () =>
        (tables[table] ?? []).filter((r) => Object.entries(f).every(([k, v]) => r[k] === v));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => ((f[c] = v), b),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        upsert: (payload: Record<string, unknown>) => {
          sink.upserts.push({ table, payload });
          return { error: null };
        },
      };
      return b;
    },
  };
}

const caller = (db: unknown, partnerId = "p1") =>
  practiceProfileRouter.createCaller({ userId: "u", partnerId, supabase: db } as never);

beforeEach(() => {
  sink.upserts = [];
});

describe("practiceProfile.getPracticeProfile", () => {
  test("returns the saved profile; unset fields are null", async () => {
    const db = makeDb({
      partner_practice_profile: [{ partner_id: "p1", albo_number: "12345", foro: "Roma" }],
    });
    const res = await caller(db, "p1").getPracticeProfile();
    expect(res.albo_number).toBe("12345");
    expect(res.foro).toBe("Roma");
    expect(res.assicuratore).toBeNull(); // unset field filled from the null default
  });

  test("returns an all-null profile when none saved", async () => {
    const res = await caller(makeDb({ partner_practice_profile: [] }), "p1").getPracticeProfile();
    expect(res.albo_number).toBeNull();
    expect(res.partita_iva).toBeNull();
  });

  test("PARTNER-SCOPE: p1 cannot read pOther's profile; pOther can (positive control)", async () => {
    const db = () =>
      makeDb({ partner_practice_profile: [{ partner_id: "pOther", albo_number: "SECRET" }] });
    await expect(caller(db(), "p1").getPracticeProfile()).resolves.toMatchObject({ albo_number: null });
    await expect(caller(db(), "pOther").getPracticeProfile()).resolves.toMatchObject({ albo_number: "SECRET" });
  });
});

describe("practiceProfile.updatePracticeProfile", () => {
  test("upserts stamped with the CALLER's partner_id; blanks persist as null", async () => {
    const db = makeDb({ partner_practice_profile: [] });
    await caller(db, "p1").updatePracticeProfile({ albo_number: "999", foro: "Milano", assicuratore: "  " });
    expect(sink.upserts).toHaveLength(1);
    const payload = sink.upserts[0]!.payload;
    expect(payload.partner_id).toBe("p1"); // cannot target another partner
    expect(payload.albo_number).toBe("999");
    expect(payload.foro).toBe("Milano");
    expect(payload.assicuratore).toBeNull(); // whitespace-only → null (renders as gap)
    expect(payload.numero_polizza).toBeNull(); // omitted → null
  });

  test("a different partner's upsert is stamped with THAT partner_id (not p1)", async () => {
    await caller(makeDb({ partner_practice_profile: [] }), "pB").updatePracticeProfile({ foro: "Torino" });
    expect(sink.upserts[0]!.payload.partner_id).toBe("pB");
  });
});
