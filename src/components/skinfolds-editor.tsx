"use client";

/**
 * Skinfold (plicometria) editor.
 *
 * Reusable across the intake form and the client edit page. Captures the seven
 * Jackson & Pollock sites. The engine downstream picks the best formula based
 * on how many sites are filled (7-site / 3-site / heuristic) — this editor
 * shows the live count + chosen method.
 *
 * Stateless — owner passes in current `value` (string-keyed for input control)
 * and an `onChange(next)` callback.
 */

import { useMemo } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

/** All values are strings to keep <input> control simple; "" means unfilled. */
export interface SkinfoldsValue {
  triceps: string;
  chest: string;
  abdomen: string;
  suprailiac: string;
  subscapular: string;
  thigh: string;
  midaxillary: string;
}

export const EMPTY_SKINFOLDS: SkinfoldsValue = {
  triceps: "",
  chest: "",
  abdomen: "",
  suprailiac: "",
  subscapular: "",
  thigh: "",
  midaxillary: "",
};

// ── Field config ─────────────────────────────────────────────────────────────

const FIELDS: Array<{ key: keyof SkinfoldsValue; label: string }> = [
  { key: "triceps", label: "Tricipite (mm)" },
  { key: "chest", label: "Pettorale (mm)" },
  { key: "abdomen", label: "Addominale (mm)" },
  { key: "suprailiac", label: "Soprailiaca (mm)" },
  { key: "subscapular", label: "Sottoscapolare (mm)" },
  { key: "thigh", label: "Coscia (mm)" },
  { key: "midaxillary", label: "Ascellare media (mm)" },
];

// ── Styles (Tailwind) ────────────────────────────────────────────────────────

const labelCls = "block text-sm font-medium text-zinc-700 mb-1";
const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900";

// ── Component ────────────────────────────────────────────────────────────────

export interface SkinfoldsEditorProps {
  value: SkinfoldsValue;
  onChange: (next: SkinfoldsValue) => void;
  /** Optional hint shown above the grid. */
  hint?: string;
}

/** Return how many sites are filled and the formula the engine will use. */
export function skinfoldStatus(value: SkinfoldsValue): {
  filledCount: number;
  method: "7site" | "3site" | "heuristic";
  methodLabel: string;
} {
  const filledCount = Object.values(value).filter((v) => v.trim() !== "" && !isNaN(parseFloat(v))).length;
  if (filledCount >= 7) return { filledCount, method: "7site", methodLabel: "Jackson & Pollock 7 pliche (gold standard)" };
  if (filledCount >= 3) return { filledCount, method: "3site", methodLabel: "Jackson & Pollock 3 pliche (buona affidabilità)" };
  return { filledCount, method: "heuristic", methodLabel: "Stima euristica BMI (precisione limitata)" };
}

export function SkinfoldsEditor({
  value,
  onChange,
  hint = "Misure in millimetri. Compila almeno 3 siti per il calcolo a 3 pliche, tutti per il 7 pliche.",
}: SkinfoldsEditorProps) {
  const status = useMemo(() => skinfoldStatus(value), [value]);

  return (
    <div className="space-y-3">
      {hint && <p className="text-sm text-zinc-500">{hint}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <input
              type="number"
              className={inputCls}
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              placeholder="0.0"
              min={0}
              step={0.1}
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        <span className="font-semibold text-zinc-700">{status.filledCount} / 7 pliche.</span>{" "}
        Metodo applicato: <span className="font-medium text-zinc-800">{status.methodLabel}</span>.
      </p>
    </div>
  );
}
