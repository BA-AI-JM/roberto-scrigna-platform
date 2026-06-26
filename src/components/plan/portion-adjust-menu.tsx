"use client";

/**
 * #21 — portion-adjustment dropdown for the plan-review Meals tab. Replaces the
 * single "Aggiusta Porzioni" button with a menu of adjustment options.
 *
 * Backend (PR #23) — plan.adjustPortions now accepts an optional magnitude:
 *   - absent / mode:"target"  → rescale the whole day to its calorie target
 *     (scale = targetKcal/actualKcal) — the original behaviour, byte-identical.
 *   - mode:"relative", scalePct → bump every ingredient by (1 + scalePct/100),
 *     allowed regardless of tolerance, with the engine's realism rails.
 * So every option here is wireable; resolveAdjustArgs maps each to its payload.
 *
 * Presentational: the parent owns the mutation; this maps a chosen option to the
 * mutation args.
 */

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

/** The "snap to calorie target" option (original behaviour). */
export const ADJUST_TO_TARGET = "target";

export interface PortionAdjustOption {
  value: string;
  label: string;
}

/** Adjustment options, all wireable against the PR #23 backend. */
export const PORTION_ADJUST_OPTIONS: PortionAdjustOption[] = [
  { value: ADJUST_TO_TARGET, label: "Centra sul target calorico" },
  { value: "increase-10", label: "Aumenta del 10%" },
  { value: "increase-25", label: "Aumenta del 25%" },
  { value: "decrease-10", label: "Riduci del 10%" },
];

export interface AdjustArgs {
  planId: string;
  dayType: string;
  mode?: "target" | "relative";
  scalePct?: number;
}

/**
 * Map a selected option to the adjustPortions mutation args, or null if the
 * value is unknown. "target" sends the EXACT original payload ({planId,dayType});
 * the relative options add mode + scalePct (+10 / +25 / −10).
 */
export function resolveAdjustArgs(value: string, ctx: { planId: string; dayType: string }): AdjustArgs | null {
  const base = { planId: ctx.planId, dayType: ctx.dayType };
  switch (value) {
    case ADJUST_TO_TARGET:
      return base; // absent mode === "target" (byte-identical to the old button)
    case "increase-10":
      return { ...base, mode: "relative", scalePct: 10 };
    case "increase-25":
      return { ...base, mode: "relative", scalePct: 25 };
    case "decrease-10":
      return { ...base, mode: "relative", scalePct: -10 };
    default:
      return null;
  }
}

interface PortionAdjustMenuProps {
  planId: string;
  dayType: string;
  pending: boolean;
  onAdjust: (args: AdjustArgs) => void;
}

export function PortionAdjustMenu({ planId, dayType, pending, onAdjust }: PortionAdjustMenuProps) {
  // Held empty so the trigger always shows the placeholder (action menu, not a
  // stateful picker): each selection fires its action then resets.
  const [value, setValue] = useState("");

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(v) => {
        const args = resolveAdjustArgs(v, { planId, dayType });
        if (args) onAdjust(args);
        setValue("");
      }}
    >
      <SelectTrigger
        aria-label="Aggiusta porzioni"
        className="h-7 w-auto gap-1 rounded-xl border-none bg-blue-100 px-3 text-xs font-semibold text-blue-700"
      >
        <SelectValue placeholder={pending ? "Aggiustando…" : "Aggiusta porzioni"} />
      </SelectTrigger>
      <SelectContent>
        {PORTION_ADJUST_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
