"use client";

/**
 * Per-session kcal row (#10, reworked in #5/A1) — live PROVISIONAL estimate +
 * an optional coach override, now CONTROLLED by the parent editor.
 *
 * The override lives ON the session object (kcal_override) and is saved with
 * the surrounding form — the old raw-fetch seam to
 * trainingLog.setSessionKcalOverride expected a training_log UUID and rejected
 * the planned grid's composite ids ("0:1") as invalid on every save (Roberto's
 * "240 kcal → invalid" bug). Display-only by construction: the intake→engine
 * mapping (training-modality.ts) never reads kcal_override.
 *
 * The estimate recomputes live as modality/duration/RPE change — this is the
 * "move RPE, watch the kcal" loop Roberto asked for; the override, when set,
 * supersedes it visually but the live estimate stays visible alongside.
 */
import { useEffect, useState } from "react";
import { estimateSessionKcal, type EstimableSession } from "@/lib/training-kcal/estimate-session-kcal";
import { parseOverrideInput } from "@/lib/training-kcal/override-validation";

export function SessionKcalRow({
  sessionId,
  session,
  bodyweightKg,
  overrideKcal,
  onOverrideChange,
}: {
  /** Composite planned-session key "<dayIndex>:<sessionIndex>" (a11y ids only). */
  sessionId: string;
  session: EstimableSession;
  bodyweightKg: number | null | undefined;
  /** Current saved override (null = none). Controlled by the parent editor. */
  overrideKcal: number | null;
  /** Set (number) or clear (null) the override on the session object. */
  onOverrideChange: (value: number | null) => void;
}) {
  const estimate = estimateSessionKcal(session, bodyweightKg);
  const [overrideStr, setOverrideStr] = useState(overrideKcal != null ? String(overrideKcal) : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the parent's value changes (row re-keyed, external clear).
  useEffect(() => {
    setOverrideStr(overrideKcal != null ? String(overrideKcal) : "");
    setSaved(false);
    setError(null);
  }, [sessionId, overrideKcal]);

  const errId = `ovr-err-${sessionId}`;

  const onSave = () => {
    const { value, error: vErr } = parseOverrideInput(overrideStr);
    if (vErr) {
      setError(vErr);
      setSaved(false);
      return;
    }
    onOverrideChange(value); // null when empty → clears
    setError(null);
    setSaved(true);
  };

  const onClear = () => {
    setOverrideStr("");
    onOverrideChange(null);
    setError(null);
    setSaved(true);
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-zinc-100 pt-2">
      {/* Current kcal: override supersedes the estimate (text + label, not colour alone) */}
      <div className="text-xs leading-tight">
        {overrideKcal != null ? (
          <span>
            <span className="font-semibold text-zinc-900">{overrideKcal} kcal</span>
            <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">modificato</span>
            {estimate != null && (
              <span className="ml-2 text-zinc-500 line-through" aria-label={`stima ${estimate} kcal`}>
                ~{estimate} stimato
              </span>
            )}
          </span>
        ) : (
          <span className="text-zinc-500">
            {estimate != null ? (
              <>
                ~{estimate} kcal <span className="text-zinc-500">· stimato</span>
              </>
            ) : (
              "kcal stimato: n/d"
            )}
          </span>
        )}
      </div>

      {/* Override input */}
      <div>
        <label htmlFor={`ovr-${sessionId}`} className="block text-[11px] font-medium text-zinc-600 mb-0.5">
          kcal personalizzato
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`ovr-${sessionId}`}
            type="number"
            inputMode="numeric"
            min={1}
            placeholder={estimate != null ? String(estimate) : "kcal"}
            className="w-24 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
            value={overrideStr}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            onChange={(e) => {
              setOverrideStr(e.target.value);
              setError(null);
              setSaved(false);
            }}
          />
          <button
            type="button"
            onClick={onSave}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Applica
          </button>
          {overrideKcal != null && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Rimuovi
            </button>
          )}
          {/* Persistent live region for the success announcement (WCAG 4.1.3). */}
          <span role="status" aria-live="polite" className="text-[11px] font-medium text-green-700">
            {saved ? "applicato — salva la scheda per confermare" : ""}
          </span>
        </div>
        {error && (
          <p id={errId} role="alert" className="mt-0.5 text-[11px] text-red-600">
            {error}
          </p>
        )}
      </div>

      <p className="max-w-[220px] text-[10px] leading-snug text-zinc-600">
        Per attività insolite dove la stima non si applica (es. pattinaggio). Non modifica il calcolo del piano.
      </p>
    </div>
  );
}
