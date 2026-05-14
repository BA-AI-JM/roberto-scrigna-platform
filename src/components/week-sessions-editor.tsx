"use client";

/**
 * Weekly training-sessions editor.
 *
 * Reusable across the intake form and the client edit page. Lets the coach
 * assign per-day training sessions (modality + duration + RPE). Days with no
 * sessions are considered "riposo" (rest); days with ≥1 session become
 * "training" in the engine's weekSchedule.
 *
 * Stateless — owner passes in the current `value` and an `onChange(next)`
 * callback. Indexing is Mon(0) … Sun(6).
 */

import { useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrainingSession {
  modality: string;
  duration_min: number;
  rpe: number;
}

/** Map of weekday index (0=Mon..6=Sun) → sessions for that day. */
export type WeekSessions = Record<number, TrainingSession[]>;

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS_IT = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

export const TRAINING_MODALITY_OPTIONS = [
  "Forza",
  "Ipertrofia",
  "Cardio LISS",
  "Cardio HIIT",
  "Crossfit",
  "Yoga / Mobilità",
  "Sport di squadra",
  "Arti marziali",
  "Ciclismo",
  "Corsa",
  "Nuoto",
  "Altro",
] as const;

const DEFAULT_NEW_SESSION: TrainingSession = {
  modality: "Forza",
  duration_min: 60,
  rpe: 7,
};

// ── Styles (Tailwind) ────────────────────────────────────────────────────────

const labelCls = "block text-sm font-medium text-zinc-700 mb-1";
const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900";
const selectCls = `${inputCls} bg-white`;

// ── Component ────────────────────────────────────────────────────────────────

export interface WeekSessionsEditorProps {
  value: WeekSessions;
  onChange: (next: WeekSessions) => void;
  /** Optional helper line below the title. */
  hint?: string;
}

export function WeekSessionsEditor({
  value,
  onChange,
  hint = "Aggiungi sessioni per ogni giorno di allenamento. I giorni senza sessioni sono considerati riposo.",
}: WeekSessionsEditorProps) {
  const setSessions = useCallback(
    (dayIndex: number, sessions: TrainingSession[]) => {
      onChange({ ...value, [dayIndex]: sessions });
    },
    [value, onChange]
  );

  const addSession = useCallback(
    (dayIndex: number) => {
      const existing = value[dayIndex] ?? [];
      setSessions(dayIndex, [...existing, { ...DEFAULT_NEW_SESSION }]);
    },
    [value, setSessions]
  );

  const removeSession = useCallback(
    (dayIndex: number, sessionIndex: number) => {
      const existing = value[dayIndex] ?? [];
      setSessions(
        dayIndex,
        existing.filter((_, i) => i !== sessionIndex)
      );
    },
    [value, setSessions]
  );

  const updateSession = useCallback(
    (
      dayIndex: number,
      sessionIndex: number,
      field: keyof TrainingSession,
      next: string | number
    ) => {
      const existing = [...(value[dayIndex] ?? [])];
      const current = existing[sessionIndex];
      if (!current) return;
      existing[sessionIndex] = { ...current, [field]: next } as TrainingSession;
      setSessions(dayIndex, existing);
    },
    [value, setSessions]
  );

  return (
    <div className="space-y-4">
      {hint && <p className="text-sm text-zinc-500">{hint}</p>}

      {DAYS_IT.map((dayName, dayIndex) => {
        const sessions = value[dayIndex] ?? [];
        const isTraining = sessions.length > 0;

        return (
          <div
            key={dayIndex}
            className={`rounded-xl border p-4 ${
              isTraining ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-sm text-zinc-800">{dayName}</span>
              <div className="flex items-center gap-2">
                {isTraining ? (
                  <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white">
                    Allenamento
                  </span>
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
                    Riposo
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => addSession(dayIndex)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50"
                >
                  + Sessione
                </button>
              </div>
            </div>

            {sessions.map((session, si) => (
              <div
                key={si}
                className="mt-2 rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Modalità</label>
                      <select
                        className={selectCls}
                        value={session.modality}
                        onChange={(e) =>
                          updateSession(dayIndex, si, "modality", e.target.value)
                        }
                      >
                        {TRAINING_MODALITY_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelCls}>Durata (min)</label>
                      <input
                        type="number"
                        className={inputCls}
                        value={session.duration_min}
                        onChange={(e) =>
                          updateSession(
                            dayIndex,
                            si,
                            "duration_min",
                            Math.max(1, parseInt(e.target.value) || 1)
                          )
                        }
                        min={1}
                        max={480}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>{`RPE: ${session.rpe}`}</label>
                      <input
                        type="range"
                        className="w-full h-2 cursor-pointer accent-zinc-900 mt-1"
                        value={session.rpe}
                        onChange={(e) =>
                          updateSession(
                            dayIndex,
                            si,
                            "rpe",
                            parseInt(e.target.value)
                          )
                        }
                        min={1}
                        max={10}
                        step={1}
                      />
                      <div className="flex justify-between text-xs text-zinc-400 mt-0.5">
                        <span>1</span>
                        <span>10</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSession(dayIndex, si)}
                    className="mt-6 rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                    title="Rimuovi sessione"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
