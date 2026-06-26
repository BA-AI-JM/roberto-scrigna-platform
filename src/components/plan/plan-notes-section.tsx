"use client";

/**
 * #3 — Plan narrative editors ("Note e strategia"), relocated from the removed
 * "Guida" tab into the Macro tab of the plan review. Four editable textareas
 * (composition analysis, nutrition strategy, training notes, coach notes) bound
 * to the plan's GuidanceSection. Each field is persisted via the same saveEdits
 * path as before and rendered into the client PDF — only the standalone tab was
 * removed; no field (or data path) was dropped.
 *
 * Presentational only: the parent owns the guidance state + onUpdate (saveEdits).
 */

import type { CSSProperties } from "react";
import type { GuidanceSection } from "../../pdf/types";

/** The narrative fields shown, in order, with their Italian labels. */
export const PLAN_NOTE_FIELDS: { key: keyof GuidanceSection; label: string }[] = [
  { key: "bodyCompAnalysis", label: "Analisi Composizione Corporea" },
  { key: "nutritionStrategy", label: "Strategia Nutrizionale" },
  { key: "trainingNotes", label: "Note Allenamento" },
  { key: "coachNotes", label: "Note del Coach" },
];

interface PlanNotesSectionProps {
  guidance: GuidanceSection;
  onUpdate: (field: keyof GuidanceSection, value: string) => void;
  textareaStyle: CSSProperties;
  cardStyle: CSSProperties;
}

export function PlanNotesSection({
  guidance,
  onUpdate,
  textareaStyle,
  cardStyle,
}: PlanNotesSectionProps) {
  return (
    <div>
      <div style={cardStyle}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 4px" }}>
          Note e strategia
        </h3>
        <p style={{ fontSize: "12px", color: "#71717a", margin: 0 }}>
          Testi descrittivi del piano (compaiono nel PDF del cliente). La
          composizione corporea numerica vive nella scheda cliente dedicata.
        </p>
      </div>
      {PLAN_NOTE_FIELDS.map((f) => (
        <div key={f.key} style={cardStyle}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "8px",
              color: "#18181b",
            }}
          >
            {f.label}
          </label>
          <textarea
            value={guidance[f.key] ?? ""}
            onChange={(e) => onUpdate(f.key, e.target.value)}
            style={textareaStyle}
            rows={6}
            placeholder={`${f.label}...`}
          />
        </div>
      ))}
    </div>
  );
}
