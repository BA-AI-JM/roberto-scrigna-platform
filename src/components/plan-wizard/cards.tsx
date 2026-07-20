"use client";
/**
 * Plan-wizard cards (T3.4a extraction — WeekStructureCard + MacroOverridesCard
 * moved VERBATIM from plans/generate/page.tsx; zero behavior change; props
 * unchanged). Visual retokenization happens in the wizard rebuild, not here.
 */
import { useMemo, useState } from "react";
import { isTrainingLikeDayType, type DayType } from "../../engine/types";
import { groupedSportOptions } from "../../engine/sport-taxonomy";
import { PeriodizationModeSelector } from "../plan/periodization-mode-selector";
import {
  ALL_DAY_TYPES,
  DAY_LABELS_IT,
  DAY_TYPE_COLORS,
  DAY_TYPE_LABELS,
  WEEK_PRESETS,
} from "./constants";

/** Per-day training session shape sent to the server. Matches
 * IntakeTrainingSession from services/training-modality. */
export interface DaySession {
  modality?: string;
  duration_min?: number;
  rpe?: number;
}


export type WeekPreviewData = {
  days: ReadonlyArray<{
    index: number;
    dayType: DayType;
    tdeeKcal: number;
    exerciseKcal: number;
    targetKcal: number;
    proteinG: number;
    fatG: number;
    carbG: number;
  }>;
  weeklyAverageKcal: number;
  weeklyAverageProteinG: number;
  weeklyAverageTdeeKcal: number;
};

export interface WeekStructureCardProps {
  weekSchedule: DayType[];
  perDaySessions: (DaySession[] | null)[];
  weekPreview: WeekPreviewData | undefined;
  weekPreviewFetching: boolean;
  onPreset: (preset: DayType[]) => void;
  onUpdateDay: (i: number, patch: { dayType?: DayType; sessions?: DaySession[] | null }) => void;
  sectionStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}

export function WeekStructureCard({
  weekSchedule,
  perDaySessions,
  weekPreview,
  weekPreviewFetching,
  onPreset,
  onUpdateDay,
  sectionStyle,
  labelStyle,
  inputStyle,
}: WeekStructureCardProps) {
  const sportGroups = useMemo(() => groupedSportOptions(), []);

  return (
    <div style={sectionStyle}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px", marginTop: 0, color: "#18181b" }}>
        Struttura del piano
      </h2>
      <p style={{ fontSize: "12px", color: "#71717a", marginTop: 0, marginBottom: "14px" }}>
        Imposta i giorni ON / OFF / refeed / deload e l&apos;attività di ogni giorno ON. Il dispendio
        e le kcal target si aggiornano in tempo reale.
      </p>

      {/* Periodization explainer (Item #19) — names the choice the calendar makes */}
      <div
        style={{
          fontSize: "12px",
          color: "#52525b",
          padding: "10px 12px",
          backgroundColor: "#fafafa",
          border: "1px solid #f4f4f5",
          borderRadius: "8px",
          marginBottom: "16px",
          lineHeight: "1.5",
        }}
      >
        <div style={{ fontWeight: 600, color: "#3f3f46", marginBottom: "6px" }}>
          Come scegliere la periodizzazione
        </div>
        <div style={{ marginBottom: "4px" }}>
          <strong style={{ color: "#18181b" }}>Media settimanale</strong> — stesso
          apporto calorico ogni giorno, senza differenziare allenamento e riposo
          (imposta tutti i giorni sullo stesso tipo, o usa il preset omonimo).
        </div>
        <div>
          <strong style={{ color: "#18181b" }}>
            Differenzia allenamento / riposo
          </strong>{" "}
          — apporto più alto nei giorni di allenamento, più basso nei giorni di
          riposo (giorni ON/OFF diversi nel calendario qui sotto).
        </div>
      </div>

      {/* Presets */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>Preset rapidi</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {Object.entries(WEEK_PRESETS).map(([label, preset]) => (
            <button
              key={label}
              type="button"
              onClick={() => onPreset(preset)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                border: "1px solid #d4d4d8",
                backgroundColor: "#ffffff",
                color: "#3f3f46",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid — horizontal scroll on narrow screens so the 7 day cells never crush */}
      <div style={{ overflowX: "auto", marginBottom: "14px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "6px",
            minWidth: "520px",
          }}
        >
        {weekSchedule.map((dt, i) => {
          const c = DAY_TYPE_COLORS[dt];
          return (
            <div
              key={i}
              style={{
                border: `1px solid ${c.border}`,
                borderRadius: "8px",
                padding: "8px 6px",
                background: c.bg,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <div style={{ fontSize: "11px", color: c.text, fontWeight: 600 }}>
                {DAY_LABELS_IT[i]}
              </div>
              <select
                value={dt}
                onChange={(e) => onUpdateDay(i, { dayType: e.target.value as DayType })}
                style={{
                  fontSize: "10px",
                  padding: "2px 4px",
                  border: "none",
                  background: "transparent",
                  color: c.text,
                  fontWeight: 700,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {ALL_DAY_TYPES.map((opt) => (
                  <option key={opt} value={opt}>
                    {DAY_TYPE_LABELS[opt]}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        </div>
      </div>

      {/* Per-day sessions for training days */}
      <div style={{ marginBottom: "14px" }}>
        <label style={labelStyle}>Attività per giorno (solo giorni ON)</label>
        <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "440px" }}>
          {weekSchedule.map((dt, i) => {
            if (!isTrainingLikeDayType(dt)) return null;
            const sessions = perDaySessions[i] ?? [];
            const first = sessions[0] ?? { modality: "", duration_min: 60, rpe: 7 };
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 100px 80px",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#3f3f46" }}>
                  {DAY_LABELS_IT[i]}
                </div>
                <select
                  value={first.modality ?? ""}
                  onChange={(e) =>
                    onUpdateDay(i, {
                      sessions: e.target.value
                        ? [{ ...first, modality: e.target.value }]
                        : null,
                    })
                  }
                  style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}
                >
                  <option value="">Default (media settimanale)</option>
                  {sportGroups.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.entries.map((s) => (
                        <option key={s.displayIt} value={s.displayIt}>
                          {s.displayIt}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  type="number"
                  min={10}
                  max={300}
                  step={5}
                  value={first.duration_min ?? 60}
                  onChange={(e) =>
                    onUpdateDay(i, {
                      sessions: [{ ...first, duration_min: Number(e.target.value) || 60 }],
                    })
                  }
                  placeholder="min"
                  style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={first.rpe ?? 7}
                  onChange={(e) =>
                    onUpdateDay(i, {
                      sessions: [{ ...first, rpe: Number(e.target.value) || 7 }],
                    })
                  }
                  placeholder="RPE"
                  style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}
                />
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* #17 Stage B — periodization mode selector (sets the week vocabulary). */}
      <PeriodizationModeSelector
        weekSchedule={weekSchedule}
        onSelect={onPreset}
        labelStyle={labelStyle}
      />

      {/* Live weekly table */}
      <div>
        <label style={labelStyle}>
          Dispendio energetico settimanale {weekPreviewFetching ? "· aggiornamento…" : ""}
        </label>
        <div className="table-scroll">
        <div
          style={{
            border: "1px solid #e4e4e7",
            borderRadius: "8px",
            overflow: "hidden",
            fontSize: "12px",
            minWidth: "480px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 60px 1fr 1fr 1fr",
              background: "#f4f4f5",
              padding: "6px 10px",
              fontWeight: 600,
              color: "#52525b",
            }}
          >
            <div>Giorno</div>
            <div>Tipo</div>
            <div style={{ textAlign: "right" }}>TDEE</div>
            <div style={{ textAlign: "right" }}>Attività</div>
            <div style={{ textAlign: "right" }}>Apporto</div>
          </div>
          {(weekPreview?.days ?? Array.from({ length: 7 }, (_, i) => ({
            index: i,
            dayType: weekSchedule[i] ?? "rest",
            tdeeKcal: 0,
            exerciseKcal: 0,
            targetKcal: 0,
          }))).map((d) => (
            <div
              key={d.index}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 60px 1fr 1fr 1fr",
                padding: "6px 10px",
                borderTop: "1px solid #e4e4e7",
                color: "#3f3f46",
              }}
            >
              <div style={{ fontWeight: 600 }}>{DAY_LABELS_IT[d.index]}</div>
              <div style={{ color: DAY_TYPE_COLORS[d.dayType].text }}>
                {DAY_TYPE_LABELS[d.dayType]}
              </div>
              <div className="tnum" style={{ textAlign: "right" }}>{d.tdeeKcal || "—"}</div>
              <div className="tnum" style={{ textAlign: "right" }}>{d.exerciseKcal || "—"}</div>
              <div className="tnum" style={{ textAlign: "right", fontWeight: 600 }}>
                {d.targetKcal || "—"}
              </div>
            </div>
          ))}
          {weekPreview && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px 60px 1fr 1fr 1fr",
                padding: "8px 10px",
                background: "#fafafa",
                borderTop: "1px solid #e4e4e7",
                fontWeight: 700,
                color: "#18181b",
              }}
            >
              <div>Media</div>
              <div>—</div>
              <div className="tnum" style={{ textAlign: "right" }}>{weekPreview.weeklyAverageTdeeKcal}</div>
              <div style={{ textAlign: "right" }}>—</div>
              <div className="tnum" style={{ textAlign: "right" }}>{weekPreview.weeklyAverageKcal}</div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Macro overrides card ─────────────────────────────────────────────────────

export interface MacroOverridesCardProps {
  weekSchedule: DayType[];
  macroOverrides: Record<DayType, { proteinG: string; fatG: string; carbG: string }>;
  weekPreview: WeekPreviewData | undefined;
  onChange: (dt: DayType, field: "proteinG" | "fatG" | "carbG", value: string) => void;
  onClear: (dt: DayType) => void;
  sectionStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}

export function MacroOverridesCard({
  weekSchedule,
  macroOverrides,
  weekPreview,
  onChange,
  onClear,
  sectionStyle,
  labelStyle,
  inputStyle,
}: MacroOverridesCardProps) {
  // Only show rows for day-types actually present in the schedule (incl. #17 tiers).
  const presentDayTypes = useMemo(() => {
    const seen = new Set<DayType>();
    for (const dt of weekSchedule) seen.add(dt);
    return ALL_DAY_TYPES.filter((dt) => seen.has(dt));
  }, [weekSchedule]);

  // Help the coach by showing what the engine would compute when the field is blank
  const formulaPreview = useMemo(() => {
    const out: Partial<Record<DayType, { proteinG: number; fatG: number; carbG: number }>> = {};
    if (!weekPreview) return out;
    for (const day of weekPreview.days) {
      if (!out[day.dayType]) {
        out[day.dayType] = { proteinG: day.proteinG, fatG: day.fatG, carbG: day.carbG };
      }
    }
    return out;
  }, [weekPreview]);

  return (
    <div style={sectionStyle}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px", marginTop: 0, color: "#18181b" }}>
        Macro per giorno (opzionale)
      </h2>
      <p style={{ fontSize: "12px", color: "#71717a", marginTop: 0, marginBottom: "14px" }}>
        Lascia vuoto per usare la formula automatica (2.5/2.2 g P/kg massa magra, 0.9–1.0 g F/kg peso).
        Imposta un valore in grammi per fissare quel macronutriente su quel tipo di giorno.
      </p>

      <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "440px" }}>
        {presentDayTypes.map((dt) => {
          const row = macroOverrides[dt];
          const formula = formulaPreview[dt];
          const dirty = row.proteinG !== "" || row.fatG !== "" || row.carbG !== "";
          return (
            <div
              key={dt}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 1fr 1fr 60px",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: DAY_TYPE_COLORS[dt].text,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  background: DAY_TYPE_COLORS[dt].bg,
                  border: `1px solid ${DAY_TYPE_COLORS[dt].border}`,
                  textAlign: "center",
                }}
              >
                {DAY_TYPE_LABELS[dt]}
              </div>
              {(["proteinG", "fatG", "carbG"] as const).map((field) => (
                <div key={field}>
                  <label
                    style={{
                      fontSize: "10px",
                      color: "#71717a",
                      display: "block",
                      marginBottom: "2px",
                    }}
                  >
                    {field === "proteinG" ? "P (g)" : field === "fatG" ? "F (g)" : "C (g)"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={row[field]}
                    onChange={(e) => onChange(dt, field, e.target.value)}
                    placeholder={
                      formula
                        ? String(
                            field === "proteinG"
                              ? formula.proteinG
                              : field === "fatG"
                              ? formula.fatG
                              : formula.carbG
                          )
                        : "—"
                    }
                    style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px" }}
                  />
                </div>
              ))}
              {dirty ? (
                <button
                  type="button"
                  onClick={() => onClear(dt)}
                  style={{
                    fontSize: "11px",
                    color: "#2563eb",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  reset
                </button>
              ) : (
                <div />
              )}
            </div>
          );
        })}
      </div>
      </div>

      {/* Hidden labelStyle reference to satisfy linter when unused */}
      <span style={{ ...labelStyle, display: "none" }} />
    </div>
  );
}

// ── Small UI helpers ─────────────────────────────────────────────────────────

