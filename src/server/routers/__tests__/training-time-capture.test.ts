/**
 * #18 nutrient timing — training-time capture at intake.
 *
 * Proves the additive startTime/endTime on a training session: round-trips
 * through client.createSnapshot into _intake.training_sessions (JSONB, no
 * migration), is read back by the intakeTrainingSessions() helper (the source
 * for client.getById's _intake + plan.estimateForClient), the HH:MM format is
 * validated, and absent time leaves intake unchanged.
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

import { clientRouter } from "../client";
import { intakeTrainingSessions } from "../plan";

const CID = "11111111-1111-4111-8111-111111111111";

/** Fake supabase: client check resolves a client row; client_snapshot insert is captured. */
function makeDb(sink: Array<{ table: string; payload: Record<string, unknown> }>) {
  const clientRow = { id: CID, date_of_birth: "1990-01-01", sex: "male" };
  return {
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        is: () => b,
        single: () => Promise.resolve({ data: clientRow, error: null }),
        insert: (payload: Record<string, unknown>) => {
          sink.push({ table, payload });
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "snap-1" }, error: null }) }) };
        },
      };
      return b;
    },
  };
}

const callerWith = (sink: Array<{ table: string; payload: Record<string, unknown> }>) =>
  clientRouter.createCaller({ userId: "u", partnerId: "p1", supabase: makeDb(sink) } as never);

const sessionPayload = (insert: Array<{ table: string; payload: Record<string, unknown> }>) => {
  const snap = insert.find((i) => i.table === "client_snapshot")!.payload;
  const skin = snap.skinfold_data as Record<string, unknown>;
  const intake = skin._intake as Record<string, unknown>;
  return intake.training_sessions as Record<string, Array<Record<string, unknown>>>;
};

describe("training-time capture (#18)", () => {
  test("startTime/endTime round-trip through createSnapshot into _intake", async () => {
    const sink: Array<{ table: string; payload: Record<string, unknown> }> = [];
    await callerWith(sink).createSnapshot({
      clientId: CID,
      trainingSessions: { "0": [{ modality: "bjj", duration_min: 90, rpe: 8, startTime: "18:00", endTime: "19:30" }] },
    });
    const ts = sessionPayload(sink);
    expect(ts["0"]![0]!.startTime).toBe("18:00");
    expect(ts["0"]![0]!.endTime).toBe("19:30");
    expect(ts["0"]![0]!.duration_min).toBe(90); // existing fields intact

    // Read-back: intakeTrainingSessions() (feeds getById _intake + estimateForClient) surfaces the time.
    const snap = sink.find((i) => i.table === "client_snapshot")!.payload;
    const readBack = intakeTrainingSessions(snap as Record<string, unknown>);
    expect(readBack?.["0"]?.[0]?.startTime).toBe("18:00");
    expect(readBack?.["0"]?.[0]?.endTime).toBe("19:30");
  });

  test("HH:MM validation rejects a bad clock time (before any DB write)", async () => {
    const sink: Array<{ table: string; payload: Record<string, unknown> }> = [];
    await expect(
      callerWith(sink).createSnapshot({
        clientId: CID,
        trainingSessions: { "0": [{ modality: "bjj", duration_min: 90, rpe: 8, startTime: "25:61" }] },
      })
    ).rejects.toThrow();
    expect(sink.length).toBe(0); // zod rejected before the insert
  });

  test("absent time leaves intake unchanged (additive — existing intake still valid)", async () => {
    const sink: Array<{ table: string; payload: Record<string, unknown> }> = [];
    await callerWith(sink).createSnapshot({
      clientId: CID,
      trainingSessions: { "0": [{ modality: "bjj", duration_min: 90, rpe: 8 }] },
    });
    const ts = sessionPayload(sink);
    expect(ts["0"]![0]!.startTime).toBeUndefined();
    expect(ts["0"]![0]!.modality).toBe("bjj"); // session still persisted
  });
});
