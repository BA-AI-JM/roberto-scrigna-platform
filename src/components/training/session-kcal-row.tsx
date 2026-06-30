"use client";

/**
 * Per-session kcal row (#10) for the weekly grid — DISPLAY + an optional coach
 * override. Shows a PROVISIONAL estimated kcal (same mapping as the engine,
 * clearly labelled "stimato") and an optional "kcal personalizzato" override for
 * unusual activities where the estimate doesn't fit (e.g. pattinaggio).
 *
 * Self-contained: it NEVER touches the session's generation-feeding values
 * (modality/duration/RPE). The override is written only via the separate
 * setSessionKcalOverride seam.
 */
import { useEffect, useState } from "react";
import { estimateSessionKcal, type EstimableSession } from "@/lib/training-kcal/estimate-session-kcal";
import { setSessionKcalOverride, SessionKcalError } from "@/lib/training-kcal/session-kcal-adapter";
import { parseOverrideInput, overrideErrorMessage } from "@/lib/training-kcal/override-validation";

export function SessionKcalRow({
  sessionId,
  session,
  bodyweightKg,
  initialOverride = null,
}: {
  /** Composite planned-session key "<dayIndex>:<sessionIndex>". */
  sessionId: string;
  session: EstimableSession;
  bodyweightKg: number | null | undefined;
  initialOverride?: number | null;
}) {
  const estimate = estimateSessionKcal(session, bodyweightKg);
  const [overrideStr, setOverrideStr] = useState(initialOverride != null ? String(initialOverride) : "");
  const [savedOverride, setSavedOverride] = useState<number | null>(initialOverride);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync local state when this row's identity or its saved override changes
  // (e.g. the parent reassigns the row to a different session, or a read seam
  // later supplies overrides) so a reused row never shows another session's
  // state. NOTE: planned grid sessions are array-index keyed (no stable id), so
  // deleting/reordering sessions within a day can still re-key an override —
  // robust identity is the backend's to define (see session-kcal-adapter.ts).
  useEffect(() => {
    setOverrideStr(initialOverride != null ? String(initialOverride) : "");
    setSavedOverride(initialOverride);
    setSaved(false);
    setError(null);
  }, [sessionId, initialOverride]);

  const errId = `ovr-err-${sessionId}`;

  const persist = async (value: number | null) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setSessionKcalOverride(sessionId, value);
      setSavedOverride(value);
      setSaved(true);
    } catch (e) {
      setError(overrideErrorMessage(e instanceof SessionKcalError ? e.code : null));
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    const { value, error: vErr } = parseOverrideInput(overrideStr);
    if (vErr) {
      setError(vErr);
      setSaved(false);
      return;
    }
    void persist(value); // value === null when the field is empty → clears the override
  };

  const onClear = () => {
    setOverrideStr("");
    void persist(null);
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-zinc-100 pt-2">
      {/* Current kcal: override supersedes the estimate (text + label, not colour alone) */}
      <div className="text-xs leading-tight">
        {savedOverride != null ? (
          <span>
            <span className="font-semibold text-zinc-900">{savedOverride} kcal</span>
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
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
          {savedOverride != null && (
            <button
              type="button"
              onClick={onClear}
              disabled={saving}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Rimuovi
            </button>
          )}
          {/* Persistent live region for the success announcement (WCAG 4.1.3). */}
          <span role="status" aria-live="polite" className="text-[11px] font-medium text-green-700">
            {saved ? "salvato" : ""}
          </span>
        </div>
        {error && (
          <p id={errId} role="alert" className="mt-0.5 text-[11px] text-red-600">
            {error}
          </p>
        )}
      </div>

      <p className="max-w-[220px] text-[10px] leading-snug text-zinc-600">
        Per attività insolite dove la stima non si applica (es. pattinaggio).
      </p>
    </div>
  );
}
