"use client";

/**
 * E2E harness client wrapper — drives the REAL <WeekSessionsEditor> (with the
 * #10 estimate badge + override row) over local state, so Playwright can verify
 * its behaviour with the override tRPC call mocked. Not shipped (the page gates
 * on NEXT_PUBLIC_E2E_KCAL).
 */
import { useState } from "react";
import { WeekSessionsEditor, type WeekSessions } from "@/components/week-sessions-editor";

export function KcalE2EHarness() {
  // Pesi — Forza, 60 min, RPE 5 @ 80 kg → estimate = round(3.0 × 80 × 1 × 0.85) = 204 kcal.
  const [value, setValue] = useState<WeekSessions>({ 0: [{ modality: "Pesi — Forza", duration_min: 60, rpe: 5 }] });
  return (
    <div className="mx-auto max-w-3xl p-6">
      <WeekSessionsEditor value={value} onChange={setValue} bodyweightKg={80} />
    </div>
  );
}
