"use client";

/**
 * #17 Stage B — the 4-mode periodization selector for the generate wizard's
 * "Struttura del piano" card. Picking a mode applies its DayType[7] vocabulary
 * via the existing applyPreset (onSelect); the calendar + expenditure preview
 * then update. The coach can still fine-tune individual days afterwards.
 *
 * Presentational: the parent owns the schedule state (applyPreset) and the live
 * expenditure table — this only renders the four mode choices.
 */

import type { CSSProperties } from "react";
import type { DayType } from "../../engine/types";
import { PERIODIZATION_MODES, activeModeId } from "./periodization-modes";

interface PeriodizationModeSelectorProps {
  weekSchedule: DayType[];
  onSelect: (schedule: DayType[]) => void;
  labelStyle: CSSProperties;
}

export function PeriodizationModeSelector({
  weekSchedule,
  onSelect,
  labelStyle,
}: PeriodizationModeSelectorProps) {
  const active = activeModeId(weekSchedule);

  return (
    <div style={{ marginBottom: "16px" }}>
      <label style={labelStyle}>Modalità di periodizzazione</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "8px",
        }}
      >
        {PERIODIZATION_MODES.map((mode, i) => {
          const selected = active === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelect(mode.schedule.slice())}
              aria-pressed={selected}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: "8px",
                border: selected ? "2px solid #18181b" : "1px solid #d4d4d8",
                background: selected ? "#fafafa" : "#ffffff",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#18181b" }}>
                {i + 1} · {mode.label}
              </div>
              <div style={{ fontSize: "11px", color: "#71717a", marginTop: "2px" }}>
                {mode.hint}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
